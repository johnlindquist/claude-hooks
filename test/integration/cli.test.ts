import {execSync} from 'node:child_process'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('CLI Integration Tests', () => {
  const testDir = path.join(__dirname, '..', '..', 'test-integration-output')
  const binPath = path.join(__dirname, '..', '..', 'bin', 'run.js')

  beforeEach(async () => {
    await fs.remove(testDir)
    await fs.ensureDir(testDir)
  })

  after(async () => {
    await fs.remove(testDir)
  })

  describe('full workflow', () => {
    it('should complete a full installation workflow', async () => {
      const output = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      }).toString()

      expect(output).to.include('Claude hooks initialized successfully!')

      // Check files exist
      const settingsPath = path.join(testDir, '.claude/settings.json')
      const indexPath = path.join(testDir, '.claude/hooks/index.ts')
      const libPath = path.join(testDir, '.claude/hooks/lib.ts')
      const sessionPath = path.join(testDir, '.claude/hooks/session.ts')

      expect(await fs.pathExists(settingsPath)).to.be.true
      expect(await fs.pathExists(indexPath)).to.be.true
      expect(await fs.pathExists(libPath)).to.be.true
      expect(await fs.pathExists(sessionPath)).to.be.true

      // Verify settings structure
      const settings = await fs.readJson(settingsPath)
      expect(settings.hooks).to.have.property('PreToolUse')
      expect(settings.hooks).to.have.property('PostToolUse')
      expect(settings.hooks).to.have.property('Notification')
      expect(settings.hooks).to.have.property('Stop')
      expect(settings.hooks).to.have.property('SessionStart')
    })

    it('should handle existing hooks correctly', async () => {
      // First installation
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Try to install again without force - should fail
      let errorThrown = false
      try {
        execSync(`node ${binPath} init`, {
          cwd: testDir,
          encoding: 'utf8',
        })
      } catch (error) {
        errorThrown = true
        expect(error.message).to.include('Hooks already exist')
      }
      expect(errorThrown).to.be.true

      // Try with force flag - should succeed
      const forceOutput = execSync(`node ${binPath} init --force`, {
        cwd: testDir,
        encoding: 'utf8',
      }).toString()

      expect(forceOutput).to.include('Claude hooks initialized successfully!')
    })
  })

  describe('command variations', () => {
    it('should work with npx-style execution', async () => {
      const output = execSync(`node ${binPath}`, {
        cwd: testDir,
        encoding: 'utf8',
      }).toString()

      expect(output).to.include('Claude hooks initialized successfully!')
    })

    it('should show help with --help flag', () => {
      const output = execSync(`node ${binPath} --help`, {
        encoding: 'utf8',
      })

      expect(output).to.include('claude-hooks')
      expect(output).to.include('VERSION')
      expect(output).to.include('COMMANDS')
    })

    it('should show init help with init --help', () => {
      const output = execSync(`node ${binPath} init --help`, {
        encoding: 'utf8',
      })

      expect(output).to.include('Initialize Claude hooks in your project')
      expect(output).to.include('--force')
      expect(output).to.include('EXAMPLES')
    })
  })

  describe('settings file variations', () => {
    it('should create custom settings file with --settings flag', async () => {
      const customSettingsName = 'my-custom-settings.json'
      
      const output = execSync(`node ${binPath} init --settings=${customSettingsName}`, {
        cwd: testDir,
        encoding: 'utf8',
      }).toString()

      expect(output).to.include(customSettingsName)

      const customSettingsPath = path.join(testDir, '.claude', customSettingsName)
      expect(await fs.pathExists(customSettingsPath)).to.be.true

      const settings = await fs.readJson(customSettingsPath)
      expect(settings.hooks).to.have.property('PreToolUse')
    })
  })
})