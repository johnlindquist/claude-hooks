import {execSync} from 'node:child_process'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('init', () => {
  const testDir = path.join(__dirname, '..', '..', 'test-output')
  const binPath = path.join(__dirname, '..', '..', 'bin', 'run.js')

  beforeEach(async () => {
    // Clean up and create test directory
    await fs.remove(testDir)
    await fs.ensureDir(testDir)
  })

  afterEach(async () => {
    // Clean up
    await fs.remove(testDir)
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
        const output = execSync(`node ${binPath} init --help`, {encoding: 'utf8'})
        expect(output).to.contain('Initialize Claude Code hooks')
        expect(output).to.contain('--force')
        expect(output).to.contain('--local')
      }
    })
  })

  describe('basic setup', () => {
    it('runs setup', async () => {
      const output = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })
      expect(output).to.contain('Claude Hooks Setup')
      expect(output).to.contain('Claude Code hooks initialized')
    })

    it('creates all required files', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
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
      })

      const indexContent = await fs.readFile(path.join(testDir, '.claude/hooks/index.ts'), 'utf8')

      // Check shebang
      expect(indexContent).to.contain('#!/usr/bin/env bun')

      // Check imports
      expect(indexContent).to.contain("from './lib'")
      expect(indexContent).to.contain("from './session'")

      // Check handler functions
      expect(indexContent).to.contain('async function preToolUse')
      expect(indexContent).to.contain('async function postToolUse')
      expect(indexContent).to.contain('async function notification')
      expect(indexContent).to.contain('async function stop')
      expect(indexContent).to.contain('async function subagentStop')
      expect(indexContent).to.contain('async function userPromptSubmit')
      expect(indexContent).to.contain('async function preCompact')

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
      })
      expect(output).to.contain('Claude Code hooks initialized!')
    })
  })

  describe('force flag', () => {
    it('overwrites existing files without prompting', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      const output = execSync(`node ${binPath} init --force`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(output).to.contain('Claude Hooks Setup')
      expect(output).to.contain('Claude Code hooks initialized')
      expect(output).not.to.contain('already exist')
    })

    it('warns about existing hooks without force flag', async () => {
      execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      const output = execSync(`node ${binPath} init`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(output).to.contain('Claude hooks already exist')
      expect(output).to.contain('Use --force to overwrite')
    })
  })

  describe('--local flag', () => {
    it('creates settings.json.local instead of settings.json', async () => {
      execSync(`node ${binPath} init --local`, {
        cwd: testDir,
        encoding: 'utf8',
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
      })

      expect(output).to.contain('Created settings.json.local for personal configuration')
    })

    it('works with --force flag', async () => {
      // Create initial hooks
      execSync(`node ${binPath} init --local`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      // Force overwrite with local flag
      const output = execSync(`node ${binPath} init --local --force`, {
        cwd: testDir,
        encoding: 'utf8',
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
        return
      }

      try {
        // Make directory read-only
        await fs.chmod(testDir, 0o555)

        let errorOccurred = false
        try {
          execSync(`node ${binPath} init`, {
            cwd: testDir,
            encoding: 'utf8',
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
