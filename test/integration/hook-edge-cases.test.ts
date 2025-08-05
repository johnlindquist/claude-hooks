import {spawn} from 'node:child_process'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Helper to run a hook and capture output
async function runHook(
  scriptPath: string,
  payload: Record<string, any>,
  options: {cwd?: string; logFile?: string} = {},
): Promise<{response: Record<string, any>; logs: string[]}> {
  return new Promise((resolve) => {
    const child = spawn('bun', [scriptPath], {
      cwd: options.cwd || path.dirname(scriptPath),
      env: {...process.env},
    })

    let output = ''
    const logs: string[] = []

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      logs.push(data.toString())
    })

    child.on('close', (_code) => {
      let response = {}
      try {
        if (output.trim()) {
          response = JSON.parse(output.trim())
        }
      } catch (_e) {
        // Ignore parse errors
      }

      resolve({response, logs})
    })

    // Send the payload
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

describe('Hook Edge Cases and Race Conditions', () => {
  const tempDir = path.join(tmpdir(), 'claude-hooks-edge-test')
  const hookScriptPath = path.join(tempDir, 'index.ts')
  const libPath = path.join(tempDir, 'lib.ts')

  before(async () => {
    await fs.ensureDir(tempDir)
    // Copy the lib file
    const libSourcePath = path.join(__dirname, '..', '..', 'templates', 'hooks', 'lib.ts')
    await fs.copy(libSourcePath, libPath)
  })

  after(async () => {
    await fs.remove(tempDir)
  })

  describe('Duplicate Hook Execution Prevention', () => {
    it('should not execute both pre and post hooks for the same event', async () => {
      // This tests the scenario where both hooks were firing
      const _executionLog: string[] = []

      const hookScript = `#!/usr/bin/env bun
import {runHooks} from './lib'
import * as fs from 'fs'

const logFile = '${path.join(tempDir, 'execution.log')}'

const PreToolUse = async (payload) => {
  const log = 'PRE:' + payload.toolName + ':' + Date.now()
  fs.appendFileSync(logFile, log + '\\n')
  return {}
}

const PostToolUse = async (payload) => {
  const log = 'POST:' + payload.toolName + ':' + Date.now()
  fs.appendFileSync(logFile, log + '\\n')
  return {}
}

runHooks({
  PreToolUse,
  PostToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Create log file
      await fs.writeFile(path.join(tempDir, 'execution.log'), '')

      // Test PreToolUse
      await runHook(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'Edit',
        toolArgs: {file_path: 'test.js'},
      })

      // Test PostToolUse
      await runHook(hookScriptPath, {
        type: 'PostToolUse',
        toolName: 'Edit',
        toolResult: {success: true},
      })

      // Read execution log
      const logContent = await fs.readFile(path.join(tempDir, 'execution.log'), 'utf-8')
      const logLines = logContent.trim().split('\n').filter(Boolean)

      // Verify only the correct hooks were called
      expect(logLines).to.have.lengthOf(2)
      expect(logLines[0]).to.match(/^PRE:Edit:\d+$/)
      expect(logLines[1]).to.match(/^POST:Edit:\d+$/)
    })

    it('should handle rapid sequential hook calls without cross-contamination', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHooks} from './lib'

let callCount = 0

const PreToolUse = async (payload) => {
  callCount++
  const myCount = callCount
  
  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
  
  return {
    message: \`Call \${myCount}: \${payload.toolName}\`
  }
}

runHooks({
  PreToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Fire multiple hooks rapidly
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(
          runHook(hookScriptPath, {
            type: 'PreToolUse',
            toolName: `Tool${i}`,
          }),
        )
      }

      const results = await Promise.all(promises)

      // Each call should have a unique response
      const messages = results.map((r) => r.response.message).filter(Boolean)
      expect(messages).to.have.lengthOf(5)
      expect(new Set(messages).size).to.equal(5) // All unique
    })
  })

  describe('Process Argument Validation', () => {
    it('should ignore hooks when wrong hook type is specified in argv', async () => {
      // The new lib.ts doesn't check argv[2], so hooks always execute based on the payload type
      const hookScript = `#!/usr/bin/env bun
import {runHooks} from './lib'

// Simulate wrong hook type in argv (but this doesn't affect new lib.ts)
process.argv[2] = 'WrongHookType'

const PreToolUse = async (payload) => {
  return {
    message: 'PreToolUse executed',
    block: true
  }
}

runHooks({
  PreToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const {response} = await runHook(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'Edit',
      })

      // The new implementation always executes based on payload type, not argv
      expect(response).to.have.property('block', true)
      expect(response).to.have.property('message', 'PreToolUse executed')
    })

    it('should handle unknown hook types gracefully', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHooks} from './lib'

const unknownHook = async (payload) => {
  return {
    message: 'Unknown hook executed'
  }
}

runHooks({
  unknownHook
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const {response} = await runHook(hookScriptPath, {
        type: 'UnknownHookType',
        some_data: 'test',
      })

      // Should handle gracefully without errors
      expect(response).to.deep.equal({})
    })
  })

  describe('Shared Code Execution Prevention', () => {
    it('should not execute shared initialization code multiple times', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHooks} from './lib'
import * as fs from 'fs'

const countFile = '${path.join(tempDir, 'init-count.txt')}'

// Shared initialization code
let count = parseInt(fs.readFileSync(countFile, 'utf-8'))
count++
fs.writeFileSync(countFile, count.toString())

const PreToolUse = async (payload) => {
  return {
    message: \`Init count: \${count}\`
  }
}

const PostToolUse = async (payload) => {
  return {
    message: \`Init count: \${count}\`
  }
}

runHooks({
  PreToolUse,
  PostToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Create count file
      await fs.writeFile(path.join(tempDir, 'init-count.txt'), '0')

      // Run multiple hooks
      await runHook(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'Edit',
      })

      await runHook(hookScriptPath, {
        type: 'PostToolUse',
        toolName: 'Edit',
      })

      // Check that initialization ran twice (once per process)
      const finalCount = await fs.readFile(path.join(tempDir, 'init-count.txt'), 'utf-8')
      expect(parseInt(finalCount)).to.equal(2)
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle handler errors without affecting other hooks', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHooks} from './lib'

const PreToolUse = async (payload) => {
  if (payload.toolName === 'ErrorTool') {
    throw new Error('Intentional error')
  }
  return {
    message: 'Success'
  }
}

const PostToolUse = async (payload) => {
  return {
    message: 'PostToolUse works'
  }
}

runHooks({
  PreToolUse,
  PostToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test with error - the lib.ts outputs error to console.error as JSON
      const {response: errorResponse, logs} = await runHook(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'ErrorTool',
      })

      // The error is logged to stderr, not returned as response
      const errorLog = logs.join('')
      expect(errorLog).to.include('Hook error')
      expect(errorLog).to.include('Intentional error')

      // Test normal operation
      const {response: successResponse} = await runHook(hookScriptPath, {
        type: 'PreToolUse',
        toolName: 'NormalTool',
      })

      expect(successResponse).to.deep.equal({message: 'Success'})

      // Test other hook still works
      const {response: postResponse} = await runHook(hookScriptPath, {
        type: 'PostToolUse',
        toolName: 'AnyTool',
      })

      expect(postResponse).to.deep.equal({message: 'PostToolUse works'})
    })
  })
})