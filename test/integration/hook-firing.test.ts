import {expect} from 'chai'
import {spawn} from 'node:child_process'
import * as fs from 'fs-extra'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Mock JSONL data for different hook scenarios
const MOCK_DATA = {
  preToolUse: {
    session_id: 'test-session-001',
    transcript_path: '/tmp/claude-transcript.jsonl',
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: '/test/file.ts',
      old_string: 'console.log("old")',
      new_string: 'console.log("new")'
    }
  },
  postToolUse: {
    session_id: 'test-session-001',
    transcript_path: '/tmp/claude-transcript.jsonl',
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: '/test/file.ts',
      old_string: 'console.log("old")',
      new_string: 'console.log("new")'
    },
    tool_response: {
      success: true,
      file_path: '/test/file.ts'
    }
  },
  notification: {
    session_id: 'test-session-001',
    transcript_path: '/tmp/claude-transcript.jsonl',
    hook_event_name: 'Notification',
    message: 'Working on the task...',
    title: 'Progress Update'
  },
  userPromptSubmit: {
    session_id: 'test-session-001',
    transcript_path: '/tmp/claude-transcript.jsonl',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Please run the tests'
  },
  sessionStart: {
    session_id: 'test-session-001',
    transcript_path: '/tmp/claude-transcript.jsonl',
    hook_event_name: 'SessionStart',
    source: 'cli'
  }
}

describe('Hook Firing Integration Tests', () => {
  let tempDir: string
  let hookScriptPath: string
  let sessionDir: string
  let bunPath: string

  beforeEach(async () => {
    // Create a temporary directory for the test
    tempDir = path.join(tmpdir(), `claude-hooks-test-${Date.now()}`)
    await fs.ensureDir(tempDir)
    
    // Create session directory
    sessionDir = path.join(tmpdir(), 'claude-hooks-sessions')
    await fs.ensureDir(sessionDir)
    
    // Copy hook files for testing
    const hooksDir = path.join(tempDir, '.claude', 'hooks')
    await fs.ensureDir(hooksDir)
    
    // Copy the template files
    const templatesDir = path.join(__dirname, '..', '..', 'templates', 'hooks')
    await fs.copy(path.join(templatesDir, 'lib.ts'), path.join(hooksDir, 'lib.ts'))
    await fs.copy(path.join(templatesDir, 'session.ts'), path.join(hooksDir, 'session.ts'))
    
    // We'll create custom hook handlers for each test
    hookScriptPath = path.join(hooksDir, 'index.ts')
    
    // Find bun executable
    bunPath = process.env.HOME ? path.join(process.env.HOME, '.bun/bin/bun') : 'bun'
  })

  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir)
    // Clean up session files
    const sessionFiles = await fs.readdir(sessionDir).catch(() => [])
    for (const file of sessionFiles) {
      if (file.startsWith('test-session-')) {
        await fs.remove(path.join(sessionDir, file))
      }
    }
  })

  describe('Hook Isolation Tests', () => {
    it('should only execute PreToolUse handler when PreToolUse event is triggered', async () => {
      // Create a hook script that logs which handlers are called
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

const preToolUse = async (payload) => {
  console.log('HANDLER:PreToolUse')
  return {}
}

const postToolUse = async (payload) => {
  console.log('HANDLER:PostToolUse')
  return {}
}

const notification = async (payload) => {
  console.log('HANDLER:Notification')
  return {}
}

runHook({
  preToolUse,
  postToolUse,
  notification
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Run the hook with PreToolUse event
      const result = await runHook(bunPath, hookScriptPath, 'PreToolUse', MOCK_DATA.preToolUse)
      
      // Should only see PreToolUse handler called
      expect(result.stdout).to.include('HANDLER:PreToolUse')
      expect(result.stdout).not.to.include('HANDLER:PostToolUse')
      expect(result.stdout).not.to.include('HANDLER:Notification')
    })

    it('should only execute PostToolUse handler when PostToolUse event is triggered', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

const preToolUse = async (payload) => {
  console.log('HANDLER:PreToolUse')
  return {}
}

const postToolUse = async (payload) => {
  console.log('HANDLER:PostToolUse')
  return {}
}

runHook({
  preToolUse,
  postToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Run the hook with PostToolUse event
      const result = await runHook(bunPath, hookScriptPath, 'PostToolUse', MOCK_DATA.postToolUse)
      
      // Should only see PostToolUse handler called
      expect(result.stdout).not.to.include('HANDLER:PreToolUse')
      expect(result.stdout).to.include('HANDLER:PostToolUse')
    })

    it('should handle missing handlers gracefully', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

// Only define preToolUse handler
const preToolUse = async (payload) => {
  console.log('HANDLER:PreToolUse')
  return {permissionDecision: 'allow'}
}

runHook({
  preToolUse
  // postToolUse is intentionally missing
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Run PostToolUse event when handler is missing
      const result = await runHook(bunPath, hookScriptPath, 'PostToolUse', MOCK_DATA.postToolUse)
      
      // Should not crash, should return empty response
      expect(result.stdout).not.to.include('HANDLER:PreToolUse')
      expect(result.response).to.deep.equal({})
    })
  })

  describe('Hook Data Isolation Tests', () => {
    it('should not share data between different hook types', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

let sharedState = null

const preToolUse = async (payload) => {
  console.log('PreToolUse received:', payload.tool_name)
  sharedState = payload
  return {}
}

const postToolUse = async (payload) => {
  console.log('PostToolUse received:', payload.tool_name)
  // Check if we're getting contaminated data
  if (sharedState && !payload.tool_response) {
    console.error('ERROR: PostToolUse received PreToolUse data!')
  }
  return {}
}

runHook({
  preToolUse,
  postToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Run PreToolUse first
      await runHook(bunPath, hookScriptPath, 'PreToolUse', MOCK_DATA.preToolUse)
      
      // Run PostToolUse - should have its own data
      const result = await runHook(bunPath, hookScriptPath, 'PostToolUse', MOCK_DATA.postToolUse)
      
      // Should not see error message about contaminated data
      expect(result.stdout).not.to.include('ERROR: PostToolUse received PreToolUse data!')
    })

    it('should properly differentiate between hook types based on argv', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

const handlers = {
  preToolUse: async (payload) => {
    console.log('HOOK_TYPE:PreToolUse')
    console.log('EVENT_NAME:' + payload.hook_event_name)
    return {}
  },
  postToolUse: async (payload) => {
    console.log('HOOK_TYPE:PostToolUse')
    console.log('EVENT_NAME:' + payload.hook_event_name)
    return {}
  },
  notification: async (payload) => {
    console.log('HOOK_TYPE:Notification')
    console.log('EVENT_NAME:' + payload.hook_event_name)
    return {}
  }
}

runHook(handlers)
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test each hook type
      const preResult = await runHook(bunPath, hookScriptPath, 'PreToolUse', MOCK_DATA.preToolUse)
      expect(preResult.stdout).to.include('HOOK_TYPE:PreToolUse')
      expect(preResult.stdout).to.include('EVENT_NAME:PreToolUse')

      const postResult = await runHook(bunPath, hookScriptPath, 'PostToolUse', MOCK_DATA.postToolUse)
      expect(postResult.stdout).to.include('HOOK_TYPE:PostToolUse')
      expect(postResult.stdout).to.include('EVENT_NAME:PostToolUse')

      const notifResult = await runHook(bunPath, hookScriptPath, 'Notification', MOCK_DATA.notification)
      expect(notifResult.stdout).to.include('HOOK_TYPE:Notification')
      expect(notifResult.stdout).to.include('EVENT_NAME:Notification')
    })
  })

  describe('Hook Response Tests', () => {
    it('should return correct response structure for each hook type', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

runHook({
  preToolUse: async (payload) => {
    return {
      permissionDecision: 'deny',
      permissionDecisionReason: 'Test denial'
    }
  },
  postToolUse: async (payload) => {
    return {
      decision: 'block',
      reason: 'Test block'
    }
  },
  userPromptSubmit: async (payload) => {
    return {
      decision: 'approve',
      contextFiles: ['test.ts'],
      updatedPrompt: 'Updated: ' + payload.prompt
    }
  }
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test PreToolUse response
      const preResult = await runHook(bunPath, hookScriptPath, 'PreToolUse', MOCK_DATA.preToolUse)
      expect(preResult.response).to.deep.equal({
        permissionDecision: 'deny',
        permissionDecisionReason: 'Test denial'
      })

      // Test PostToolUse response
      const postResult = await runHook(bunPath, hookScriptPath, 'PostToolUse', MOCK_DATA.postToolUse)
      expect(postResult.response).to.deep.equal({
        decision: 'block',
        reason: 'Test block'
      })

      // Test UserPromptSubmit response
      const promptResult = await runHook(bunPath, hookScriptPath, 'UserPromptSubmit', MOCK_DATA.userPromptSubmit)
      expect(promptResult.response).to.deep.equal({
        decision: 'approve',
        contextFiles: ['test.ts'],
        updatedPrompt: 'Updated: Please run the tests'
      })
    })
  })

  describe('Session Data Tests', () => {
    it('should save session data independently for each hook', async () => {
      // Use unique session ID for this test
      const testSessionId = `test-session-${Date.now()}`
      const testPreData = {...MOCK_DATA.preToolUse, session_id: testSessionId}
      const testPostData = {...MOCK_DATA.postToolUse, session_id: testSessionId}
      
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'
import {saveSessionData} from './session'

runHook({
  preToolUse: async (payload) => {
    await saveSessionData('PreToolUse', {...payload, hook_type: 'PreToolUse'})
    console.log('Saved PreToolUse data')
    return {}
  },
  postToolUse: async (payload) => {
    await saveSessionData('PostToolUse', {...payload, hook_type: 'PostToolUse'})
    console.log('Saved PostToolUse data')
    return {}
  }
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Run both hooks
      await runHook(bunPath, hookScriptPath, 'PreToolUse', testPreData)
      await runHook(bunPath, hookScriptPath, 'PostToolUse', testPostData)

      // Check that session file was created and contains both entries
      const sessionFile = path.join(sessionDir, `${testSessionId}.json`)
      expect(await fs.pathExists(sessionFile)).to.be.true
      
      // Verify the content of session file
      const sessionData = await fs.readJson(sessionFile)
      expect(sessionData).to.be.an('array')
      expect(sessionData).to.have.lengthOf(2)
      
      // Check that both hook types are present
      const hookTypes = sessionData.map((entry: any) => entry.hookType)
      expect(hookTypes).to.include('PreToolUse')
      expect(hookTypes).to.include('PostToolUse')
      
      // Verify session IDs
      sessionData.forEach((entry: any) => {
        expect(entry.payload.session_id).to.equal(testSessionId)
      })
    })
  })
})

// Helper function to run a hook and capture output
async function runHook(bunExecutable: string, scriptPath: string, hookType: string, payload: any): Promise<{
  stdout: string
  stderr: string
  response: any
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(bunExecutable, [scriptPath, hookType], {
      cwd: path.dirname(scriptPath)
    })

    let stdout = ''
    let stderr = ''
    let lastLine = ''

    child.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      // Keep track of the last line for the JSON response
      const lines = output.trim().split('\n')
      if (lines.length > 0) {
        lastLine = lines[lines.length - 1]
      }
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      // Try to parse the response from the last line
      let response = {}
      try {
        // Filter out console.log lines and find the JSON response
        const lines = stdout.trim().split('\n')
        const jsonLine = lines.find(line => {
          try {
            JSON.parse(line)
            return true
          } catch {
            return false
          }
        })
        if (jsonLine) {
          response = JSON.parse(jsonLine)
        }
      } catch (e) {
        // Ignore parse errors
      }

      resolve({
        stdout,
        stderr,
        response
      })
    })

    // Send the payload as stdin
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}