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
      // This tests the scenario you mentioned where both hooks were firing
      const _executionLog: string[] = []

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

      // Test PreToolUse
      await runHook(hookScriptPath, {
        type: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {file_path: 'test.js'},
      })

      // Test PostToolUse
      await runHook(hookScriptPath, {
        type: 'PostToolUse',
        tool_name: 'Edit',
        tool_response: {success: true},
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
import {runHook} from './lib'

let callCount = 0

const preToolUse = async (payload) => {
  callCount++
  const myCount = callCount
  
  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
  
  return {
    message: \`Call \${myCount}: \${payload.tool_name}\`
  }
}

runHook({
  preToolUse
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
            tool_name: `Tool${i}`,
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
      // This tests the fix for the argv[2] hook type checking
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

// Simulate wrong hook type in argv
process.argv[2] = 'WrongHookType'

const preToolUse = async (payload) => {
  return {
    message: 'This should not execute',
    block: true
  }
}

runHook({
  preToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      const {response} = await runHook(hookScriptPath, {
        type: 'PreToolUse',
        tool_name: 'Edit',
      })

      // Hook should not be blocked since argv check should be removed
      expect(response).to.not.have.property('block')
    })

    it('should handle unknown hook types gracefully', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

const unknownHook = async (payload) => {
  return {
    message: 'Unknown hook executed'
  }
}

runHook({
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
import {runHook} from './lib'
import * as fs from 'fs'

const countFile = '${path.join(tempDir, 'init-count.txt')}'

// Shared initialization code
let count = parseInt(fs.readFileSync(countFile, 'utf-8'))
count++
fs.writeFileSync(countFile, count.toString())

const preToolUse = async (payload) => {
  return {
    message: \`Init count: \${count}\`
  }
}

const postToolUse = async (payload) => {
  return {
    message: \`Init count: \${count}\`
  }
}

runHook({
  preToolUse,
  postToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Create count file
      await fs.writeFile(path.join(tempDir, 'init-count.txt'), '0')

      // Run multiple hooks
      await runHook(hookScriptPath, {
        type: 'PreToolUse',
        tool_name: 'Edit',
      })

      await runHook(hookScriptPath, {
        type: 'PostToolUse',
        tool_name: 'Edit',
      })

      // Check that initialization ran twice (once per process)
      const finalCount = await fs.readFile(path.join(tempDir, 'init-count.txt'), 'utf-8')
      expect(parseInt(finalCount)).to.equal(2)
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle handler errors without affecting other hooks', async () => {
      const hookScript = `#!/usr/bin/env bun
import {runHook} from './lib'

const preToolUse = async (payload) => {
  if (payload.tool_name === 'ErrorTool') {
    throw new Error('Intentional error')
  }
  return {
    message: 'Success'
  }
}

const postToolUse = async (payload) => {
  return {
    message: 'PostToolUse works'
  }
}

runHook({
  preToolUse,
  postToolUse
})
`
      await fs.writeFile(hookScriptPath, hookScript)
      await fs.chmod(hookScriptPath, 0o755)

      // Test with error
      const {response: errorResponse} = await runHook(hookScriptPath, {
        type: 'PreToolUse',
        tool_name: 'ErrorTool',
      })

      // Should handle error gracefully
      expect(errorResponse).to.have.property('message')
      expect(errorResponse.message).to.include('Hook error')

      // Test normal operation
      const {response: successResponse} = await runHook(hookScriptPath, {
        type: 'PreToolUse',
        tool_name: 'NormalTool',
      })

      expect(successResponse).to.deep.equal({message: 'Success'})

      // Test other hook still works
      const {response: postResponse} = await runHook(hookScriptPath, {
        type: 'PostToolUse',
        tool_name: 'AnyTool',
      })

      expect(postResponse).to.deep.equal({message: 'PostToolUse works'})
    })
  })
})

// New helper for the refactored runHook to work with the new lib.ts structure
async function runHookWithNewLib(
  scriptPath: string,
  payload: Record<string, any>,
): Promise<{response: Record<string, any>; stdout: string; stderr: string}> {
  return new Promise((resolve) => {
    const child = spawn('bun', [scriptPath], {
      cwd: path.dirname(scriptPath),
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