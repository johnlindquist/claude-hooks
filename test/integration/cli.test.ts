import { execSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'chai'
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

  afterEach(async () => {
    await fs.remove(testDir)
  })

  describe('full workflow', () => {
    it('should complete a full installation workflow', async () => {
      // Run init command
      const output = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Check output
      expect(output).to.include('Claude Hooks Setup')
      expect(output).to.include('Bun is required')
      expect(output).to.include('Claude Code hooks initialized')

      // Verify file structure
      const files = {
        '.claude/settings.json': true,
        '.claude/hooks/index.ts': true,
        '.claude/hooks/lib.ts': true,
        '.claude/hooks/session.ts': true,
      }

      for (const [file, shouldExist] of Object.entries(files)) {
        const exists = await fs.pathExists(path.join(testDir, file))
        expect(exists, `${file} should exist`).to.equal(shouldExist)
      }
    })

    it('should handle existing hooks correctly', async () => {
      // First installation
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Modify a file to detect if it gets overwritten
      const hookFile = path.join(testDir, '.claude/hooks/index.ts')
      await fs.appendFile(hookFile, '\n// Custom modification')

      // Try to install again without force
      const secondRun = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Should warn about existing hooks
      expect(secondRun).to.include('Claude hooks already exist')
      expect(secondRun).to.include('Use --force to overwrite')

      // Custom modification should still be there
      let content = await fs.readFile(hookFile, 'utf8')
      expect(content).to.include('// Custom modification')

      // With force flag, should overwrite
      execSync(`node ${binPath} init --force`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Check that custom modification is gone
      content = await fs.readFile(hookFile, 'utf8')
      expect(content).not.to.include('// Custom modification')
    })
  })

  describe('command variations', () => {
    it('should work with npx-style execution', async () => {
      const output = execSync(`node ${binPath}`, {
        cwd: testDir,
        encoding: 'utf8',
      }).toString()

      expect(output).to.include('Claude Hooks Setup')
    })

    it('should show help with --help flag', () => {
      const output = execSync(`node ${binPath} --help`, {
        encoding: 'utf8',
      })

      expect(output).to.include('CLI to initialize Claude Code hooks')
      expect(output).to.include('COMMANDS')
      expect(output).to.include('init')
    })

    it('should show init help with init --help', () => {
      const output = execSync(`node ${binPath} init --help`, {
        encoding: 'utf8',
      })

      expect(output).to.include('Initialize Claude Code hooks')
      expect(output).to.include('--force')
      expect(output).to.include('EXAMPLES')
    })
  })
})
