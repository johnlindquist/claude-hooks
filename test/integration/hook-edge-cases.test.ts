import {expect} from 'chai'
import {spawn} from 'node:child_process'
import * as fs from 'fs-extra'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Hook Edge Cases and Race Conditions', () => {
  let tempDir: string
  let hookScriptPath: string
  let bunPath: string

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `claude-hooks-edge-${Date.now()}`)
    await fs.ensureDir(tempDir)
    
    const hooksDir = path.join(tempDir, '.claude', 'hooks')
    await fs.ensureDir(hooksDir)
    
    const templatesDir = path.join(__dirname, '..', '..', 'templates', 'hooks')
    await fs.copy(path.join(templatesDir, 'lib.ts'), path.join(hooksDir, 'lib.ts'))
    await fs.copy(path.join(templatesDir, 'session.ts'), path.join(hooksDir, 'session.ts'))
    
    hookScriptPath = path.join(hooksDir, 'index.ts')
    
    // Find bun executable
    bunPath = process.env.HOME ? path.join(process.env.HOME, '.bun/bin/bun') : 'bun'
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('Duplicate Hook Execution Prevention', () => {
    it('should not execute both pre and post hooks for the same event', async () => {
      // This tests the scenario you mentioned where both hooks were firing
      const executionLog: string[] = []
      
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'
import * as fs from 'fs'

const logFile = '${path.join(tempDir, 'execution.log')}'

const preToolUse = async (payload) => {
  const log = 'PRE:' + payload.tool_name + ':' + Date.now()
  fs.appendFileSync(logFile, log + '\\n')
  return {}
}

const postToolUse = async (payload) => {
  const log = 'POST:' + payload.tool_name + ':' + Date.now()
  fs.appendFileSync(logFile, log + '\\n')
  return {}
}

runHook({
  preToolUse,
  postToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Create log file
      await fs.writeFile(path.join(tempDir, 'execution.log'), '')

      // Execute PreToolUse
      await runHook(bunPath, hookScriptPath, 'PreToolUse', {
        session_id: 'test-dup-001',
        transcript_path: '/tmp/test.jsonl',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {file_path: 'test.js'}
      })

      // Read execution log
      const log = await fs.readFile(path.join(tempDir, 'execution.log'), 'utf8')
      const executions = log.trim().split('\n').filter(Boolean)

      // Should only have one execution
      expect(executions).to.have.lengthOf(1)
      expect(executions[0]).to.match(/^PRE:Edit:\d+$/)
      expect(executions.some(e => e.startsWith('POST:'))).to.be.false
    })

    it('should handle rapid sequential hook calls without cross-contamination', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

const handlers = {
  preToolUse: async (payload) => {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 10))
    console.log('PRE_RESULT:' + payload.tool_name)
    return {permissionDecision: 'allow'}
  },
  postToolUse: async (payload) => {
    // Different processing for post
    console.log('POST_RESULT:' + payload.tool_name + ':' + (payload.tool_response?.success || 'unknown'))
    return {}
  }
}

runHook(handlers)
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Fire multiple hooks in rapid succession
      const promises = [
        runHook(bunPath, hookScriptPath, 'PreToolUse', {
          session_id: 'rapid-001',
          transcript_path: '/tmp/test.jsonl',
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: {file_path: 'file1.js'}
        }),
        runHook(bunPath, hookScriptPath, 'PostToolUse', {
          session_id: 'rapid-001',
          transcript_path: '/tmp/test.jsonl',
          hook_event_name: 'PostToolUse',
          tool_name: 'Write',
          tool_input: {file_path: 'file2.js'},
          tool_response: {success: true}
        }),
        runHook(bunPath, hookScriptPath, 'PreToolUse', {
          session_id: 'rapid-001',
          transcript_path: '/tmp/test.jsonl',
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: {command: 'ls'}
        })
      ]

      const results = await Promise.all(promises)

      // Verify each hook got the correct result
      expect(results[0].stdout).to.include('PRE_RESULT:Edit')
      expect(results[0].stdout).not.to.include('POST_RESULT')
      
      expect(results[1].stdout).to.include('POST_RESULT:Write:true')
      expect(results[1].stdout).not.to.include('PRE_RESULT')
      
      expect(results[2].stdout).to.include('PRE_RESULT:Bash')
      expect(results[2].stdout).not.to.include('POST_RESULT')
    })
  })

  describe('Process Argument Validation', () => {
    it('should ignore hooks when wrong hook type is specified in argv', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

const preToolUse = async (payload) => {
  console.log('UNEXPECTED:PreToolUse handler called')
  return {}
}

const postToolUse = async (payload) => {
  console.log('EXPECTED:PostToolUse handler called')
  return {}
}

runHook({
  preToolUse,
  postToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Send PostToolUse data but with wrong argv
      const result = await runHook(bunPath, hookScriptPath, 'PostToolUse', {
        session_id: 'argv-test',
        transcript_path: '/tmp/test.jsonl',
        hook_event_name: 'PreToolUse', // Mismatched event name
        tool_name: 'Edit',
        tool_input: {file_path: 'test.js'}
      })

      // Should execute based on argv, not payload.hook_event_name
      expect(result.stdout).to.include('EXPECTED:PostToolUse handler called')
      expect(result.stdout).not.to.include('UNEXPECTED:PreToolUse handler called')
    })

    it('should handle unknown hook types gracefully', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

runHook({
  preToolUse: async () => {
    console.log('PreToolUse called')
    return {}
  }
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Try to run with an unknown hook type
      const result = await runHook(bunPath, hookScriptPath, 'UnknownHookType', {
        session_id: 'unknown-test',
        transcript_path: '/tmp/test.jsonl',
        hook_event_name: 'UnknownHookType'
      })

      // Should return empty response without executing any handler
      expect(result.response).to.deep.equal({})
      expect(result.stdout).not.to.include('PreToolUse called')
    })
  })

  describe('Shared Code Execution Prevention', () => {
    it('should not execute shared initialization code multiple times', async () => {
      // This tests the scenario where both hooks might execute the same initialization
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'
import * as fs from 'fs'

const countFile = '${path.join(tempDir, 'init-count.txt')}'

// Shared initialization that should only run once per process
let initCount = 0
if (fs.existsSync(countFile)) {
  initCount = parseInt(fs.readFileSync(countFile, 'utf8'))
}
initCount++
fs.writeFileSync(countFile, initCount.toString())

console.log('INIT_COUNT:' + initCount)

runHook({
  preToolUse: async (payload) => {
    console.log('PreToolUse:' + initCount)
    return {}
  },
  postToolUse: async (payload) => {
    console.log('PostToolUse:' + initCount)
    return {}
  }
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)
      
      // Initialize count file
      await fs.writeFile(path.join(tempDir, 'init-count.txt'), '0')

      // Run different hook types
      const result1 = await runHook(bunPath, hookScriptPath, 'PreToolUse', {
        session_id: 'init-test',
        transcript_path: '/tmp/test.jsonl',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {}
      })

      const result2 = await runHook(bunPath, hookScriptPath, 'PostToolUse', {
        session_id: 'init-test',
        transcript_path: '/tmp/test.jsonl',
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: {},
        tool_response: {success: true}
      })

      // Each invocation is a separate process, so init count should increment
      expect(result1.stdout).to.include('INIT_COUNT:1')
      expect(result2.stdout).to.include('INIT_COUNT:2')
      
      // But only the correct handler should execute
      expect(result1.stdout).to.include('PreToolUse:1')
      expect(result1.stdout).not.to.include('PostToolUse')
      
      expect(result2.stdout).to.include('PostToolUse:2')
      expect(result2.stdout).not.to.include('PreToolUse:2')
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle handler errors without affecting other hooks', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

runHook({
  preToolUse: async (payload) => {
    if (payload.tool_name === 'ErrorTool') {
      throw new Error('Simulated error in PreToolUse')
    }
    console.log('PreToolUse:Success')
    return {permissionDecision: 'allow'}
  },
  postToolUse: async (payload) => {
    console.log('PostToolUse:Success')
    return {}
  }
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Run hook that will error
      const errorResult = await runHook(bunPath, hookScriptPath, 'PreToolUse', {
        session_id: 'error-test',
        transcript_path: '/tmp/test.jsonl',
        hook_event_name: 'PreToolUse',
        tool_name: 'ErrorTool',
        tool_input: {}
      })

      // Should handle error gracefully
      expect(errorResult.stderr).to.include('Hook error:')
      expect(errorResult.response).to.deep.equal({action: 'continue'})

      // Run a different hook - should work fine
      const successResult = await runHook(bunPath, hookScriptPath, 'PostToolUse', {
        session_id: 'error-test',
        transcript_path: '/tmp/test.jsonl',
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: {},
        tool_response: {success: true}
      })

      expect(successResult.stdout).to.include('PostToolUse:Success')
      expect(successResult.response).to.deep.equal({})
    })
  })
})

// Helper function
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

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      let response = {}
      try {
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

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}