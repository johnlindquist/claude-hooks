import {expect} from 'chai'
import {spawn} from 'node:child_process'
import * as fs from 'fs-extra'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Sample JSONL transcript data based on typical Claude sessions
const SAMPLE_TRANSCRIPT = [
  {
    type: 'summary',
    summary: 'User asking about implementing a feature',
    leafUuid: 'abc123'
  },
  {
    parentUuid: null,
    isSidechain: false,
    userType: 'external',
    cwd: '/Users/test/project',
    sessionId: 'session-123',
    version: '1.0.0',
    gitBranch: 'main',
    type: 'user',
    message: {
      role: 'user',
      content: 'Help me implement a login feature'
    },
    uuid: 'msg-001',
    timestamp: '2024-01-01T10:00:00Z'
  },
  {
    parentUuid: 'msg-001',
    isSidechain: false,
    userType: 'external',
    cwd: '/Users/test/project',
    sessionId: 'session-123',
    version: '1.0.0',
    gitBranch: 'main',
    message: {
      id: 'claude-msg-001',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-opus',
      content: [
        {
          type: 'text',
          text: 'I\'ll help you implement a login feature. Let me first check your existing code.'
        },
        {
          type: 'tool_use',
          id: 'tool-001',
          name: 'Read',
          input: {
            file_path: '/Users/test/project/src/auth.js'
          }
        }
      ],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 50,
        service_tier: 'standard'
      }
    },
    requestId: 'req-001',
    type: 'assistant',
    uuid: 'msg-002',
    timestamp: '2024-01-01T10:00:05Z'
  }
]

describe('Transcript-Based Hook Tests', () => {
  let tempDir: string
  let hookScriptPath: string
  let transcriptPath: string
  let bunPath: string

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `claude-hooks-transcript-${Date.now()}`)
    await fs.ensureDir(tempDir)
    
    const hooksDir = path.join(tempDir, '.claude', 'hooks')
    await fs.ensureDir(hooksDir)
    
    const templatesDir = path.join(__dirname, '..', '..', 'templates', 'hooks')
    await fs.copy(path.join(templatesDir, 'lib.ts'), path.join(hooksDir, 'lib.ts'))
    await fs.copy(path.join(templatesDir, 'session.ts'), path.join(hooksDir, 'session.ts'))
    
    hookScriptPath = path.join(hooksDir, 'index.ts')
    
    // Create a sample transcript file
    transcriptPath = path.join(tempDir, 'transcript.jsonl')
    const transcriptContent = SAMPLE_TRANSCRIPT.map(msg => JSON.stringify(msg)).join('\n')
    await fs.writeFile(transcriptPath, transcriptContent)
    
    // Find bun executable
    bunPath = process.env.HOME ? path.join(process.env.HOME, '.bun/bin/bun') : 'bun'
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('Transcript Analysis in Hooks', () => {
    it('should access transcript data in hooks without triggering other hooks', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook, getInitialMessage, getAllMessages} from './lib'

const handlers = {
  preToolUse: async (payload) => {
    console.log('PreToolUse:START')
    
    // Access transcript data
    const initialMsg = await getInitialMessage(payload.transcript_path)
    console.log('InitialMessage:' + (initialMsg || 'none'))
    
    // This should NOT trigger PostToolUse
    console.log('PreToolUse:END')
    return {}
  },
  
  postToolUse: async (payload) => {
    console.log('PostToolUse:UNEXPECTED')
    return {}
  },
  
  userPromptSubmit: async (payload) => {
    console.log('UserPromptSubmit:START')
    
    // Access full conversation history
    const messages = await getAllMessages(payload.transcript_path)
    console.log('MessageCount:' + messages.length)
    
    console.log('UserPromptSubmit:END')
    return {}
  }
}

runHook(handlers)
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test PreToolUse accessing transcript
      const preResult = await runHook(bunPath, hookScriptPath, 'PreToolUse', {
        session_id: 'transcript-test',
        transcript_path: transcriptPath,
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {file_path: 'test.js'}
      })

      expect(preResult.stdout).to.include('PreToolUse:START')
      expect(preResult.stdout).to.include('InitialMessage:Help me implement a login feature')
      expect(preResult.stdout).to.include('PreToolUse:END')
      expect(preResult.stdout).not.to.include('PostToolUse:UNEXPECTED')

      // Test UserPromptSubmit accessing transcript
      const promptResult = await runHook(bunPath, hookScriptPath, 'UserPromptSubmit', {
        session_id: 'transcript-test',
        transcript_path: transcriptPath,
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Add error handling'
      })

      expect(promptResult.stdout).to.include('UserPromptSubmit:START')
      expect(promptResult.stdout).to.include('MessageCount:3')
      expect(promptResult.stdout).to.include('UserPromptSubmit:END')
      expect(promptResult.stdout).not.to.include('PostToolUse:UNEXPECTED')
    })
  })

  describe('Complex Hook Interaction Scenarios', () => {
    it('should handle nested tool analysis without recursive hook calls', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook, getToolUsage} from './lib'

let recursionDepth = 0

const handlers = {
  preToolUse: async (payload) => {
    recursionDepth++
    console.log('PreToolUse:Depth:' + recursionDepth)
    
    if (recursionDepth > 1) {
      console.error('ERROR:RECURSIVE_HOOK_CALL')
      return {permissionDecision: 'deny', permissionDecisionReason: 'Recursive hook detected'}
    }
    
    // Analyze previous tool usage
    const toolHistory = await getToolUsage(payload.transcript_path)
    console.log('ToolHistory:' + toolHistory.length)
    
    // Simulate complex logic that might accidentally trigger hooks
    if (payload.tool_name === 'Bash' && toolHistory.some(t => t.tool === 'Write')) {
      console.log('Pattern:Write-then-Bash')
    }
    
    recursionDepth--
    return {}
  },
  
  postToolUse: async (payload) => {
    console.log('PostToolUse:Tool:' + payload.tool_name)
    
    // Access tool response without triggering pre-hook
    if (payload.tool_response?.success) {
      console.log('PostToolUse:Success')
    }
    
    return {}
  }
}

runHook(handlers)
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test that analyzing tools doesn't cause recursion
      const result = await runHook(bunPath, hookScriptPath, 'PreToolUse', {
        session_id: 'recursion-test',
        transcript_path: transcriptPath,
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {command: 'npm test'}
      })

      expect(result.stdout).to.include('PreToolUse:Depth:1')
      expect(result.stdout).to.include('ToolHistory:1') // From sample transcript
      expect(result.stdout).not.to.include('ERROR:RECURSIVE_HOOK_CALL')
      expect(result.stdout).not.to.include('PostToolUse')
    })

    it('should maintain hook isolation with shared state management', async () => {
      const stateFile = path.join(tempDir, 'shared-state.json')
      await fs.writeJson(stateFile, {count: 0})

      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'
import * as fs from 'fs-extra'

const stateFile = '${stateFile}'

const handlers = {
  preToolUse: async (payload) => {
    // Read shared state
    const state = await fs.readJson(stateFile)
    state.lastPreTool = payload.tool_name
    state.preCount = (state.preCount || 0) + 1
    await fs.writeJson(stateFile, state)
    
    console.log('PreState:' + JSON.stringify(state))
    
    // This should not affect PostToolUse
    return {}
  },
  
  postToolUse: async (payload) => {
    // Read shared state
    const state = await fs.readJson(stateFile)
    state.lastPostTool = payload.tool_name
    state.postCount = (state.postCount || 0) + 1
    await fs.writeJson(stateFile, state)
    
    console.log('PostState:' + JSON.stringify(state))
    
    // Should not see PreToolUse updates from same invocation
    if (state.lastPreTool === payload.tool_name && state.preCount === state.postCount) {
      console.error('ERROR:SHARED_STATE_CONTAMINATION')
    }
    
    return {}
  }
}

runHook(handlers)
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Run PreToolUse
      await runHook(bunPath, hookScriptPath, 'PreToolUse', {
        session_id: 'state-test',
        transcript_path: transcriptPath,
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {file_path: 'test.js'}
      })

      // Run PostToolUse with same tool
      const postResult = await runHook(bunPath, hookScriptPath, 'PostToolUse', {
        session_id: 'state-test',
        transcript_path: transcriptPath,
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: {file_path: 'test.js'},
        tool_response: {success: true}
      })

      expect(postResult.stdout).not.to.include('ERROR:SHARED_STATE_CONTAMINATION')
      
      // Verify final state
      const finalState = await fs.readJson(stateFile)
      expect(finalState.preCount).to.equal(1)
      expect(finalState.postCount).to.equal(1)
      expect(finalState.lastPreTool).to.equal('Edit')
      expect(finalState.lastPostTool).to.equal('Edit')
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