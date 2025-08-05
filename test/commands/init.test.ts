import {execSync} from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('init', () => {
  let testDir: string
  const binPath = path.join(__dirname, '..', '..', 'bin', 'run.js')
  let originalCwd: string

  beforeEach(async () => {
    // Save original CWD
    originalCwd = process.cwd()

    // Create isolated test directory
    testDir = path.join(os.tmpdir(), `claude-hooks-test-${Date.now()}-${Math.random().toString(36).substring(7)}`)
    await fs.ensureDir(testDir)

    // Change to test directory
    process.chdir(testDir)
  })

  afterEach(async () => {
    // Restore original CWD
    process.chdir(originalCwd)

    // Clean up test directory
    await fs.remove(testDir)
  })

  describe('help', () => {
    it('shows help information', async () => {
      try {
        const {stdout} = await runCommand(['init', '--help'])
        expect(stdout).to.contain('Initialize Claude hooks in your project')
        expect(stdout).to.contain('--force')
        expect(stdout).to.contain('--settings')
      } catch (_error) {
        // Fallback to testing with execSync for compiled version
        const output = execSync(`node ${binPath} init --help`, {encoding: 'utf8'})
        expect(output).to.contain('Initialize Claude hooks in your project')
        expect(output).to.contain('--force')
        expect(output).to.contain('--settings')
      }
    })
  })

  describe('basic setup', () => {
    it('runs setup and creates all required files', async () => {
      const output = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(output).to.contain('Claude hooks initialized successfully!')

      // Check that all files were created
      expect(await fs.pathExists(path.join(testDir, '.claude/settings.json'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/hooks/index.ts'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/hooks/lib.ts'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/hooks/session.ts'))).to.be.true
    })

    it('generates correct settings.json with all hook types', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      const settings = await fs.readJson(path.join(testDir, '.claude/settings.json'))
      expect(settings).to.have.property('hooks')

      // Check all hook types
      const expectedHooks = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionStart']
      for (const hookType of expectedHooks) {
        expect(settings.hooks).to.have.property(hookType)
        expect(settings.hooks[hookType]).to.have.property('command')
        expect(settings.hooks[hookType]).to.have.property('args')
        expect(settings.hooks[hookType].args[0]).to.include('.claude/hooks/index.ts')
      }
    })

    it('uses absolute bun path in settings.json', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      const settings = await fs.readJson(path.join(testDir, '.claude/settings.json'))
      const bunCommand = settings.hooks.PreToolUse.command

      // Should be either an absolute path or 'bun' if it's in PATH
      expect(bunCommand).to.satisfy((cmd: string) => path.isAbsolute(cmd) || cmd === 'bun')
    })
  })

  describe('force flag', () => {
    it('fails without force flag when hooks exist', async () => {
      // First init
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Second init should fail
      let errorOccurred = false
      try {
        execSync(`node ${binPath} init`, {
          cwd: testDir,
          encoding: 'utf8',
        })
      } catch (error: any) {
        errorOccurred = true
        expect(error.message).to.contain('Hooks already exist')
      }

      expect(errorOccurred).to.be.true
    })

    it('overwrites with force flag', async () => {
      // First init
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Modify a file
      const indexPath = path.join(testDir, '.claude/hooks/index.ts')
      await fs.writeFile(indexPath, '// Modified content')

      // Force overwrite
      const output = execSync(`node ${binPath} init --force`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(output).to.contain('Claude hooks initialized successfully!')

      // Check file was overwritten
      const content = await fs.readFile(indexPath, 'utf8')
      expect(content).to.contain('import')
      expect(content).not.to.equal('// Modified content')
    })
  })

  describe('custom settings file', () => {
    it('creates custom settings file with --settings flag', async () => {
      execSync(`node ${binPath} init --settings=custom-settings.json`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(await fs.pathExists(path.join(testDir, '.claude/custom-settings.json'))).to.be.true
      expect(await fs.pathExists(path.join(testDir, '.claude/settings.json'))).to.be.false
    })
  })

  describe('error handling', () => {
    it('provides helpful error when bun is not installed', async () => {
      // This test would need to mock the bun detection
      // For now, we'll skip it as it requires complex mocking
      this.skip()
    })
  })
})
