import {spawn} from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('stdin handling', () => {
  let testDir: string
  const templatesDir = path.join(__dirname, '../../templates')

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stdin-test-'))

    // Copy the lib.ts file to the test directory
    await fs.copyFile(path.join(templatesDir, 'hooks/lib.ts'), path.join(testDir, 'lib.ts'))
  })

  afterEach(async () => {
    // Clean up
    await fs.remove(testDir)
  })

  it('should handle JSON input via Bun.stdin.json()', async () => {
    // Create a minimal test hook script
    const testScript = `#!/usr/bin/env bun

import {runHook} from './lib'

runHook({
  preToolUse: async (payload) => {
    return {
      permissionDecision: 'allow',
      testReceived: payload.tool_name
    }
  }
})
`
    const scriptPath = path.join(testDir, 'test-hook.ts')
    await fs.writeFile(scriptPath, testScript)
    await fs.chmod(scriptPath, 0o755)

    // Run the hook with test input
    const child = spawn('bun', [scriptPath, 'PreToolUse'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const testInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/test.md',
      hook_event_name: 'PreToolUse',
      tool_name: 'TestTool',
      tool_input: {test: true},
    }

    // Send input
    child.stdin.write(JSON.stringify(testInput))
    child.stdin.end()

    // Collect output
    let output = ''
    let errorOutput = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else {
          console.error('Error output:', errorOutput)
          reject(new Error(`Process exited with code ${code}`))
        }
      })
      child.on('error', reject)
    })

    // Parse and verify output
    const response = JSON.parse(output.trim())
    expect(response).to.deep.equal({
      permissionDecision: 'allow',
      testReceived: 'TestTool',
    })
  })

  it('should handle large JSON payloads', async () => {
    // Create a test hook that echoes back the size of the input
    const testScript = `#!/usr/bin/env bun

import {runHook} from './lib'

runHook({
  notification: async (payload) => {
    return {
      messageLength: payload.message.length
    }
  }
})
`
    const scriptPath = path.join(testDir, 'test-large.ts')
    await fs.writeFile(scriptPath, testScript)
    await fs.chmod(scriptPath, 0o755)

    // Create a large message
    const largeMessage = 'x'.repeat(100000) // 100KB message

    const child = spawn('bun', [scriptPath, 'Notification'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const testInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/test.md',
      hook_event_name: 'Notification',
      message: largeMessage,
    }

    // Send input
    child.stdin.write(JSON.stringify(testInput))
    child.stdin.end()

    // Collect output
    let output = ''
    let errorOutput = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else {
          console.error('Error output:', errorOutput)
          reject(new Error(`Process exited with code ${code}`))
        }
      })
      child.on('error', reject)
    })

    // Parse and verify output
    const response = JSON.parse(output.trim())
    expect(response.messageLength).to.equal(100000)
  })
})