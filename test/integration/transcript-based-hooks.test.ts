import {spawn} from 'node:child_process'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Transcript-Based Hook Tests', () => {
  let tempDir: string
  let hookScriptPath: string
  let libPath: string
  let transcriptPath: string

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(tmpdir(), `claude-hooks-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.ensureDir(tempDir)

    hookScriptPath = path.join(tempDir, 'index.ts')
    libPath = path.join(tempDir, 'lib.ts')
    transcriptPath = path.join(tempDir, 'transcript.txt')

    // Copy the lib file
    const libSourcePath = path.join(__dirname, '..', '..', 'templates', 'hooks', 'lib.ts')
    await fs.copy(libSourcePath, libPath)

    // Create a sample transcript
    const transcriptContent = `[2024-01-01T10:00:00.000Z] human: Hello Claude
[2024-01-01T10:00:01.000Z] assistant: Hello! How can I help you today?
[2024-01-01T10:00:02.000Z] human: Can you help me write a Python script?
[2024-01-01T10:00:03.000Z] assistant: I'd be happy to help you write a Python script.
[2024-01-01T10:00:04.000Z] system: tool_name="Edit" tool_input={"file_path": "script.py"}
[2024-01-01T10:00:05.000Z] system: Tool result: File created successfully
[2024-01-01T10:00:06.000Z] human: Thanks!
[2024-01-01T10:00:07.000Z] assistant: You're welcome!
[2024-01-01T10:00:08.000Z] system: tool_name="Bash" tool_input={"command": "python script.py"}
[2024-01-01T10:00:09.000Z] system: Tool result: Script executed successfully`

    await fs.writeFile(transcriptPath, transcriptContent)
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('Transcript Analysis in Hooks', () => {
    it('should access transcript data in hooks without triggering other hooks', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks, getTranscript, searchTranscript, getLastNMessages, findToolUsage } from './lib'

export const PreToolUse: HookHandler = (args) => {
  // Access transcript functions
  const transcript = getTranscript()
  const pythonMentions = searchTranscript('Python')
  const lastMessages = getLastNMessages(3)
  const editUsages = findToolUsage('Edit')
  
  console.error('TRANSCRIPT_LENGTH:' + transcript.length)
  console.error('PYTHON_MENTIONS:' + pythonMentions.length)
  console.error('LAST_MESSAGES:' + lastMessages.length)
  console.error('EDIT_USAGES:' + editUsages.length)
  
  // Block if trying to run bash after user said thanks
  if (args.toolName === 'Bash') {
    const recentMessages = getLastNMessages(5)
    const hasThanks = recentMessages.some(msg => msg.toLowerCase().includes('thanks'))
    if (hasThanks) {
      return {
        block: true,
        message: 'User already said thanks, no need to run more commands'
      }
    }
  }
  
  return {}
}

export const PostToolUse: HookHandler = () => {
  console.error('ERROR:PostToolUse should not be called')
  return {}
}

runHooks({ PreToolUse, PostToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Set TRANSCRIPT_PATH environment variable
      const result = await runHookWithTranscript(hookScriptPath, transcriptPath, {
        type: 'PreToolUse',
        toolName: 'Bash',
        toolArgs: {command: 'echo "test"'},
      })

      // Verify transcript functions were called
      expect(result.stderr).to.include('TRANSCRIPT_LENGTH:10')
      expect(result.stderr).to.include('PYTHON_MENTIONS:2')
      expect(result.stderr).to.include('LAST_MESSAGES:3')
      expect(result.stderr).to.include('EDIT_USAGES:1')

      // Verify PostToolUse was not called
      expect(result.stderr).to.not.include('ERROR:PostToolUse')

      // Verify blocking logic worked
      expect(result.response).to.deep.equal({
        block: true,
        message: 'User already said thanks, no need to run more commands',
      })
    })

    it('should handle empty transcript gracefully', async () => {
      // Create empty transcript
      await fs.writeFile(transcriptPath, '')

      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks, getTranscript, getUserMessages } from './lib'

export const PreToolUse: HookHandler = () => {
  const transcript = getTranscript()
  const userMessages = getUserMessages()
  
  console.error('EMPTY_TRANSCRIPT:' + transcript.length)
  console.error('USER_MESSAGES:' + userMessages.length)
  
  return {
    message: 'Handled empty transcript'
  }
}

runHooks({ PreToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const result = await runHookWithTranscript(hookScriptPath, transcriptPath, {
        type: 'PreToolUse',
        toolName: 'Edit',
      })

      expect(result.stderr).to.include('EMPTY_TRANSCRIPT:0')
      expect(result.stderr).to.include('USER_MESSAGES:0')
      expect(result.response.message).to.equal('Handled empty transcript')
    })

    it('should use transcript caching effectively', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks, getTranscript } from './lib'

let callCount = 0

export const PreToolUse: HookHandler = () => {
  // Call getTranscript multiple times
  const t1 = getTranscript()
  const t2 = getTranscript()
  const t3 = getTranscript()
  
  // They should all be the same (cached)
  console.error('SAME_INSTANCE:' + (t1 === t2 && t2 === t3))
  console.error('LENGTH:' + t1.length)
  
  return {
    message: 'Caching test complete'
  }
}

runHooks({ PreToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const result = await runHookWithTranscript(hookScriptPath, transcriptPath, {
        type: 'PreToolUse',
        toolName: 'Edit',
      })

      expect(result.stderr).to.include('SAME_INSTANCE:true')
      expect(result.stderr).to.include('LENGTH:10')
    })
  })
})

// Helper function to run hook with transcript
async function runHookWithTranscript(
  scriptPath: string,
  transcriptPath: string,
  payload: Record<string, any>,
): Promise<{
  response: Record<string, any>
  stdout: string
  stderr: string
}> {
  return new Promise((resolve) => {
    const child = spawn('bun', [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        TRANSCRIPT_PATH: transcriptPath,
      },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (_code) => {
      let response = {}
      try {
        // Parse the last non-empty line as JSON
        const lines = stdout.trim().split('\n').filter(Boolean)
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1]
          // Try to find JSON in the output
          const jsonMatch = lastLine.match(/\{.*\}/)
          if (jsonMatch) {
            response = JSON.parse(jsonMatch[0])
          }
        }
      } catch (_e) {
        // Ignore parse errors
      }

      resolve({response, stdout, stderr})
    })

    // Send the payload
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}