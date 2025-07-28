import * as path from 'node:path'
import {expect, test} from '@oclif/test'
import * as fs from 'fs-extra'
import * as os from 'node:os'
import sinon from 'sinon'
import inquirer from 'inquirer'

describe('init', () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-hooks-test-'))
    originalCwd = process.cwd()
    process.chdir(tempDir)
  })

  afterEach(async () => {
    // Clean up
    process.chdir(originalCwd)
    await fs.remove(tempDir)
  })

  test
    .stdout()
    .command(['init'])
    .it('creates claude hooks files', (ctx) => {
      expect(ctx.stdout).to.contain('Claude Code hooks initialized')
      expect(fs.existsSync('.claude/hooks/index.ts')).to.be.true
      expect(fs.existsSync('.claude/hooks/lib.ts')).to.be.true
      expect(fs.existsSync('.claude/hooks/session.ts')).to.be.true
      expect(fs.existsSync('.claude/settings.json')).to.be.true
    })

  test
    .stdout()
    .command(['init', '--local'])
    .it('creates local settings file with --local flag', (ctx) => {
      expect(ctx.stdout).to.contain('Claude Code hooks initialized')
      expect(ctx.stdout).to.contain('Created settings.json.local')
      expect(fs.existsSync('.claude/settings.json.local')).to.be.true
    })

  test
    .stdout()
    .command(['init'])
    .command(['init'])
    .it('prevents overwriting existing hooks without --force', (ctx) => {
      expect(ctx.stdout).to.contain('Claude hooks already exist. Use --force to overwrite.')
    })

  test
    .stdout()
    .command(['init'])
    .command(['init', '--force'])
    .stub(inquirer, 'prompt', () => Promise.resolve({shouldBackup: false}))
    .it('overwrites existing hooks with --force when backup declined', (ctx) => {
      expect(ctx.stdout).to.contain('Claude Code hooks initialized')
    })

  test
    .stdout()
    .command(['init'])
    .do(async () => {
      // Modify the index.ts file to simulate customizations
      const indexPath = '.claude/hooks/index.ts'
      await fs.writeFile(indexPath, '// Custom user code\nconsole.log("My custom hooks")')
    })
    .command(['init', '--force'])
    .stub(inquirer, 'prompt', () => Promise.resolve({shouldBackup: true}))
    .it('creates backup of index.ts when using --force with backup accepted', async (ctx) => {
      expect(ctx.stdout).to.contain('Claude Code hooks initialized')
      expect(ctx.stdout).to.contain('Backed up existing index.ts to')
      
      // Check that a backup file was created
      const backupFiles = await fs.readdir('.claude/hooks')
      const backupFile = backupFiles.find(f => f.startsWith('index.backup.') && f.endsWith('.ts'))
      expect(backupFile).to.exist
      
      // Verify the backup contains the custom content
      if (backupFile) {
        const backupContent = await fs.readFile(path.join('.claude/hooks', backupFile), 'utf-8')
        expect(backupContent).to.contain('// Custom user code')
        expect(backupContent).to.contain('My custom hooks')
      }
    })

  test
    .stdout()
    .command(['init'])
    .do(async () => {
      // Create an invalid settings.json
      await fs.ensureDir('.claude')
      await fs.writeFile('.claude/settings.json', '{invalid json')
    })
    .command(['init', '--force'])
    .stub(inquirer, 'prompt', () => Promise.resolve({shouldBackup: false}))
    .it('handles invalid JSON in existing settings.json', (ctx) => {
      expect(ctx.stdout).to.contain('Warning: Existing settings.json contains invalid JSON')
      expect(ctx.stdout).to.contain('Claude Code hooks initialized')
    })
})