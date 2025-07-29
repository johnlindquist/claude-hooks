import {execSync} from 'node:child_process'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import fs from 'fs-extra'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('init', () => {
  let testDir: string
  const binPath = path.join(__dirname, '..', '..', 'bin', 'run.js')

  beforeEach(async () => {
    // Create unique test directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-hooks-test-'))
  })

  afterEach(async () => {
    // Clean up with retry for Windows
    try {
      await fs.remove(testDir)
    } catch (error) {
      // On Windows, files might still be in use; wait and retry
      if (process.platform === 'win32' && error.code === 'EBUSY') {
        await new Promise((resolve) => setTimeout(resolve, 100))
        try {
          await fs.remove(testDir)
        } catch {
          // Ignore cleanup errors on Windows
        }
      }
    }
  })

  describe('help', () => {
    it('shows help information', async () => {
      try {
        const {stdout} = await runCommand(['init', '--help'])
        expect(stdout).to.contain('Initialize Claude Code hooks')
        expect(stdout).to.contain('--force')
        expect(stdout).to.contain('--local')
      } catch (_error) {
        // Fallback to testing with execSync for compiled version
        const output = execSync(`node ${binPath} init --help`, {
          encoding: 'utf8',
          timeout: 30000, // Increase timeout for Windows
          windowsHide: true,
        })
        expect(output).to.contain('Initialize Claude Code hooks')
        expect(output).to.contain('--force')
        expect(output).to.contain('--local')
      }
    })
  })

  describe('basic setup', () => {
    it('runs setup', async () => {
      try {
        const output = execSync(`node ${binPath} init`, {
          cwd: testDir,
          encoding: 'utf8',
          timeout: 30000, // Increase timeout for Windows
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'], // Explicitly set stdio
        })
        expect(output).to.contain('Claude Hooks Setup')
        expect(output).to.contain('Claude Code hooks initialized')
      } catch (error: any) {
        // Log more details about the error
        console.error('execSync error:', error.message)
        console.error('stdout:', error.stdout?.toString())
        console.error('stderr:', error.stderr?.toString())
        throw error
      }
    })

    it('creates all required files', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      // Check that all files were created
      expect(await fs.pathExists(path.join(testDir, '.claude/settings.json'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/hooks/index.ts'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/hooks/lib.ts'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/hooks/session.ts'))).to.be.true
    })

    it('generates correct settings.json', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      const settings = await fs.readJson(path.join(testDir, '.claude/settings.json'))
      expect(settings).to.have.property('hooks')

      // Check hooks structure
      expect(settings.hooks).to.have.property('Notification')
      expect(settings.hooks).to.have.property('Stop')
      expect(settings.hooks).to.have.property('PreToolUse')
      expect(settings.hooks).to.have.property('PostToolUse')
      expect(settings.hooks).to.have.property('SubagentStop')
      expect(settings.hooks).to.have.property('UserPromptSubmit')
      expect(settings.hooks).to.have.property('PreCompact')

      // Check command structure
      expect(settings.hooks.PreToolUse[0].hooks[0]).to.deep.equal({
        type: 'command',
        command: 'bun .claude/hooks/index.ts PreToolUse',
      })

      // Check SubagentStop command structure
      expect(settings.hooks.SubagentStop[0].hooks[0]).to.deep.equal({
        type: 'command',
        command: 'bun .claude/hooks/index.ts SubagentStop',
      })

      // Check UserPromptSubmit command structure
      expect(settings.hooks.UserPromptSubmit[0].hooks[0]).to.deep.equal({
        type: 'command',
        command: 'bun .claude/hooks/index.ts UserPromptSubmit',
      })

      // Check PreCompact command structure
      expect(settings.hooks.PreCompact[0].hooks[0]).to.deep.equal({
        type: 'command',
        command: 'bun .claude/hooks/index.ts PreCompact',
      })
    })

    it('generates correct index.ts content', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      const indexContent = await fs.readFile(path.join(testDir, '.claude/hooks/index.ts'), 'utf8')

      // Check shebang
      expect(indexContent).to.contain('#!/usr/bin/env bun')

      // Check imports
      expect(indexContent).to.contain("from './lib'")
      expect(indexContent).to.contain("from './session'")

      // Check handler functions
      expect(indexContent).to.contain('const preToolUse: PreToolUseHandler')
      expect(indexContent).to.contain('const postToolUse: PostToolUseHandler')
      expect(indexContent).to.contain('const notification: NotificationHandler')
      expect(indexContent).to.contain('const stop: StopHandler')
      expect(indexContent).to.contain('const subagentStop: SubagentStopHandler')
      expect(indexContent).to.contain('const userPromptSubmit: UserPromptSubmitHandler')
      expect(indexContent).to.contain('const preCompact: PreCompactHandler')

      // Check example functionality
      expect(indexContent).to.contain('📝 Claude is editing:')
      expect(indexContent).to.contain('🚀 Running command:')
      expect(indexContent).to.contain('💬 User prompt:')
      expect(indexContent).to.contain('🗜️  Compact triggered:')

      // Check runHook call
      expect(indexContent).to.contain('runHook({')
    })

    it('shows completion message', async () => {
      const output = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })
      expect(output).to.contain('Claude Code hooks initialized!')
    })
  })

  describe('force flag', () => {
    it('overwrites existing files with prompt', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      // Provide input to decline backup
      const output = execSync(`node ${binPath} init --force`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
        input: 'n\n',
      })

      expect(output).to.contain('Claude Hooks Setup')
      expect(output).to.contain('Claude Code hooks initialized')
    })

    it('warns about existing hooks without force flag', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      const output = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      expect(output).to.contain('Claude hooks already exist')
      expect(output).to.contain('Use --force to overwrite')
    })

    it('prompts for backup when using --force with existing hooks', async () => {
      // First init to create hooks
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      // Modify index.ts to simulate customizations
      const indexPath = path.join(testDir, '.claude/hooks/index.ts')
      const customContent = '// My custom hooks\nconsole.log("Custom code")\n'
      await fs.writeFile(indexPath, customContent)

      // Run init with --force, simulating "y" response for backup
      const output = execSync(`node ${binPath} init --force`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
        input: 'y\n',
      })

      expect(output).to.contain('Would you like to backup your existing index.ts customizations?')
      expect(output).to.contain('Backed up existing index.ts to')

      // Check that backup file was created
      const hooksDir = path.join(testDir, '.claude/hooks')
      const files = await fs.readdir(hooksDir)
      const backupFile = files.find((f) => f.startsWith('index.backup.') && f.endsWith('.ts'))
      expect(backupFile).to.exist

      // Verify backup content
      if (backupFile) {
        const backupContent = await fs.readFile(path.join(hooksDir, backupFile), 'utf8')
        expect(backupContent).to.equal(customContent)
      }
    })

    it('does not create backup when user declines', async () => {
      // First init to create hooks
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      // Run init with --force, simulating "n" response for backup
      const output = execSync(`node ${binPath} init --force`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
        input: 'n\n',
      })

      expect(output).to.contain('Would you like to backup your existing index.ts customizations?')
      expect(output).not.to.contain('Backed up existing index.ts to')

      // Check that no backup file was created
      const hooksDir = path.join(testDir, '.claude/hooks')
      const files = await fs.readdir(hooksDir)
      const backupFile = files.find((f) => f.startsWith('index.backup.') && f.endsWith('.ts'))
      expect(backupFile).to.be.undefined
    })
  })

  describe('--local flag', () => {
    it('creates settings.json.local instead of settings.json', async () => {
      execSync(`node ${binPath} init --local`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      // Check that settings.json.local was created
      expect(await fs.pathExists(path.join(testDir, '.claude/settings.json.local'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/settings.json'))).to.be.false

      // Verify the content
      const settings = await fs.readJson(path.join(testDir, '.claude/settings.json.local'))
      expect(settings.hooks).to.have.property('SubagentStop')
      expect(settings.hooks).to.have.property('UserPromptSubmit')
      expect(settings.hooks).to.have.property('PreCompact')
    })

    it('shows local flag message in output', async () => {
      const output = execSync(`node ${binPath} init --local`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      expect(output).to.contain('Created settings.json.local for personal configuration')
    })

    it('works with --force flag', async () => {
      // Create initial hooks
      execSync(`node ${binPath} init --local`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
      })

      // Force overwrite with local flag
      const output = execSync(`node ${binPath} init --local --force`, {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 30000, // Increase timeout for Windows
        windowsHide: true,
        input: 'n\n',
      })

      expect(output).to.contain('Claude Code hooks initialized')
      expect(output).to.contain('Created settings.json.local for personal configuration')
    })
  })

  describe('error handling', () => {
    it('handles permission errors gracefully', async function () {
      // Skip on Windows
      if (process.platform === 'win32') {
        this.skip()
      }

      try {
        // Make directory read-only
        await fs.chmod(testDir, 0o555)

        let errorOccurred = false
        try {
          execSync(`node ${binPath} init`, {
            cwd: testDir,
            encoding: 'utf8',
            timeout: 30000, // Increase timeout for Windows
            windowsHide: true,
          })
        } catch (error: any) {
          errorOccurred = true
          expect(error.message).to.satisfy(
            (msg: string) =>
              msg.includes('permission denied') || msg.includes('EACCES') || msg.includes('Failed to setup hooks'),
          )
        }

        expect(errorOccurred).to.be.true
      } finally {
        // Restore permissions
        await fs.chmod(testDir, 0o755)
      }
    })
  })
})
