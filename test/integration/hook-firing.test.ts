import {spawn} from 'node:child_process'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Hook Firing Integration Tests', () => {
  let tempDir: string
  let hookScriptPath: string
  let libPath: string
  let sessionPath: string

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(tmpdir(), `claude-hooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.ensureDir(tempDir)

    hookScriptPath = path.join(tempDir, 'index.ts')
    libPath = path.join(tempDir, 'lib.ts')
    sessionPath = path.join(tempDir, 'session.ts')

    // Copy the lib and session files
    const libSourcePath = path.join(__dirname, '..', '..', 'templates', 'hooks', 'lib.ts')
    const sessionSourcePath = path.join(__dirname, '..', '..', 'templates', 'hooks', 'session.ts')

    await fs.copy(libSourcePath, libPath)
    await fs.copy(sessionSourcePath, sessionPath)
  })

  afterEach(async () => {
    // Clean up
    try {
      // List all files in tempDir before cleanup for debugging
      if (await fs.pathExists(tempDir)) {
        const files = await fs.readdir(tempDir)
        // console.log('Files in tempDir before cleanup:', files)
      }
      await fs.remove(tempDir)
    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  })

  describe('Hook Isolation Tests', () => {
    it('should only execute PreToolUse handler when PreToolUse event is triggered', async () => {
      // Create a hook script that logs which handlers are called
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks } from './lib'

// Track which handlers are called
const executionLog: string[] = []

export const PreToolUse: HookHandler = (args) => {
  console.error('EXECUTED:PreToolUse:' + args.toolName)
  return {
    message: 'PreToolUse executed'
  }
}

export const PostToolUse: HookHandler = (args) => {
  console.error('EXECUTED:PostToolUse:' + args.toolName)
  return {
    message: 'PostToolUse executed'
  }
}

export const Notification: HookHandler = (args) => {
  console.error('EXECUTED:Notification:' + args.message)
  return {
    message: 'Notification executed'
  }
}

export const Stop: HookHandler = () => {
  console.error('EXECUTED:Stop')
  return {
    message: 'Stop executed'
  }
}

// Run the hook system
runHooks({
  PreToolUse,
  PostToolUse,
  Notification,
  Stop
})
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test PreToolUse event
      const result = await runHookAndCapture(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'Edit',
        toolArgs: {file_path: 'test.js'},
      })

      // Check that only PreToolUse was executed
      expect(result.stderr).to.include('EXECUTED:PreToolUse:Edit')
      expect(result.stderr).to.not.include('EXECUTED:PostToolUse')
      expect(result.stderr).to.not.include('EXECUTED:Notification')
      expect(result.stderr).to.not.include('EXECUTED:Stop')

      // Check the response
      expect(result.response).to.deep.equal({
        message: 'PreToolUse executed',
      })
    })

    it('should only execute PostToolUse handler when PostToolUse event is triggered', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks } from './lib'

export const PreToolUse: HookHandler = () => {
  console.error('ERROR:PreToolUse should not be called')
  return { message: 'PreToolUse executed' }
}

export const PostToolUse: HookHandler = (args) => {
  console.error('SUCCESS:PostToolUse called for ' + args.toolName)
  return { message: 'PostToolUse executed correctly' }
}

runHooks({ PreToolUse, PostToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const result = await runHookAndCapture(hookScriptPath, {
        type: 'PostToolUse',
        toolName: 'Write',
        toolResult: {success: true},
      })

      expect(result.stderr).to.include('SUCCESS:PostToolUse called for Write')
      expect(result.stderr).to.not.include('ERROR:PreToolUse')
      expect(result.response).to.have.property('message', 'PostToolUse executed correctly')
    })

    it('should handle Notification events correctly', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks } from './lib'

export const Notification: HookHandler = (args) => {
  console.error('NOTIFICATION:' + args.severity + ':' + args.message)
  return { message: 'Notification received' }
}

export const PreToolUse: HookHandler = () => {
  console.error('ERROR:PreToolUse should not be called')
  return { message: 'Wrong handler' }
}

runHooks({ Notification, PreToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const result = await runHookAndCapture(hookScriptPath, {
        type: 'Notification',
        message: 'Test notification',
        severity: 'info',
      })

      expect(result.stderr).to.include('NOTIFICATION:info:Test notification')
      expect(result.stderr).to.not.include('ERROR:PreToolUse')
    })

    it('should handle Stop events correctly', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks } from './lib'

export const Stop: HookHandler = () => {
  console.error('STOP:Session ended')
  return { message: 'Stop handler executed' }
}

export const PostToolUse: HookHandler = () => {
  console.error('ERROR:PostToolUse should not be called')
  return { message: 'Wrong handler' }
}

runHooks({ Stop, PostToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const result = await runHookAndCapture(hookScriptPath, {
        type: 'Stop',
      })

      expect(result.stderr).to.include('STOP:Session ended')
      expect(result.stderr).to.not.include('ERROR:PostToolUse')
    })

    it('should handle SessionStart events correctly', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks } from './lib'

export const SessionStart: HookHandler = (args) => {
  console.error('SESSION_START:' + args.sessionId)
  return { message: 'Session started' }
}

export const PreToolUse: HookHandler = () => {
  console.error('ERROR:PreToolUse should not be called')
  return { message: 'Wrong handler' }
}

runHooks({ SessionStart, PreToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const result = await runHookAndCapture(hookScriptPath, {
        type: 'SessionStart',
        sessionId: 'test-session-123',
        workingDirectory: '/test/dir',
      })

      expect(result.stderr).to.include('SESSION_START:test-session-123')
      expect(result.stderr).to.not.include('ERROR:PreToolUse')
    })

    it('should return empty response when no handler is defined for event type', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks } from './lib'

// Only define PreToolUse handler
export const PreToolUse: HookHandler = () => {
  return { message: 'PreToolUse executed' }
}

runHooks({ PreToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Send a PostToolUse event (no handler defined)
      const result = await runHookAndCapture(hookScriptPath, {
        type: 'PostToolUse',
        toolName: 'Edit',
      })

      // Should return empty response
      expect(result.response).to.deep.equal({})
      expect(result.stdout).to.equal('')
    })

    it('should handle blocking in PreToolUse correctly', async () => {
      const hookScript = `#!/usr/bin/env bun
import type { HookHandler } from './lib'
import { runHooks } from './lib'

export const PreToolUse: HookHandler = (args) => {
  if (args.toolName === 'Bash' && args.toolArgs?.command?.includes('rm -rf')) {
    return {
      block: true,
      message: 'Dangerous command blocked'
    }
  }
  return {}
}

runHooks({ PreToolUse })
`

      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test blocking
      const blockedResult = await runHookAndCapture(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'Bash',
        toolArgs: {command: 'rm -rf /'},
      })

      expect(blockedResult.response).to.deep.equal({
        block: true,
        message: 'Dangerous command blocked',
      })

      // Test non-blocking
      const allowedResult = await runHookAndCapture(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'Bash',
        toolArgs: {command: 'ls -la'},
      })

      expect(allowedResult.response).to.deep.equal({})
    })
  })
})

// Helper function to run a hook and capture all outputs
async function runHookAndCapture(
  scriptPath: string,
  payload: Record<string, any>,
): Promise<{
  response: Record<string, any>
  stdout: string
  stderr: string
}> {
  return new Promise((resolve) => {
    const child = spawn('bun', [scriptPath], {
      cwd: path.dirname(scriptPath),
    })

    let stdout = ''
    let stderr = ''
    let _lastLine = ''

    child.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      // Keep track of last line for response parsing
      const lines = output.trim().split('\n')
      if (lines.length > 0) {
        _lastLine = lines[lines.length - 1]
      }
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      console.error('Failed to start child process:', error)
    })

    child.on('close', (_code) => {
      // Try to parse the response from the last line
      let response = {}
      try {
        // Split stdout by lines and find the last non-empty line
        const lines = stdout.trim().split('\n').filter(Boolean)
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1]
          // Try to parse as JSON
          response = JSON.parse(lastLine)
        }
      } catch (_e) {
        // If parsing fails, try to find JSON in the output
        try {
          const jsonMatch = stdout.match(/\{[^}]*\}/)
          if (jsonMatch) {
            response = JSON.parse(jsonMatch[0])
          }
        } catch (_e) {
          // Ignore parse errors
        }
      }

      resolve({
        response,
        stdout,
        stderr,
      })
    })

    // Send the payload
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}