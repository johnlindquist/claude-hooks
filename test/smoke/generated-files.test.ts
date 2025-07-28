import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Skip smoke tests for now - they need to be updated for bun test compatibility
// TODO: Update these tests to use bun:test syntax instead of mocha
/*
describe.skip('Smoke Tests - Generated Files', () => {
  const testDir = path.join(__dirname, '..', '..', 'test-smoke-output')
  const binPath = path.join(__dirname, '..', '..', 'bin', 'run.js')

  before(async () => {
    // Set up once for all smoke tests
    await fs.remove(testDir)
    await fs.ensureDir(testDir)

    // Generate hooks
    execSync(`node ${binPath} init`, {
      cwd: testDir,
      encoding: 'utf8',
    })
  })

  after(async () => {
    await fs.remove(testDir)
  })

  describe('settings.json', () => {
    it('should have valid JSON structure with hooks configuration', async () => {
      const settingsPath = path.join(testDir, '.claude/settings.json')
      const settings = await fs.readJson(settingsPath)

      expect(settings).to.be.an('object')
      expect(settings.hooks).to.be.an('object')

      // Check hook structure
      const hookTypes = [
        'Notification',
        'Stop',
        'PreToolUse',
        'PostToolUse',
        'SubagentStop',
        'UserPromptSubmit',
        'PreCompact',
      ]
      for (const hookType of hookTypes) {
        expect(settings.hooks[hookType]).to.be.an('array')
        expect(settings.hooks[hookType][0]).to.have.property('matcher', '')
        expect(settings.hooks[hookType][0].hooks[0]).to.deep.equal({
          type: 'command',
          command: `bun .claude/hooks/index.ts ${hookType}`,
        })
      }
    })
  })

  describe('index.ts', () => {
    let indexContent: string

    before(async () => {
      const indexPath = path.join(testDir, '.claude/hooks/index.ts')
      indexContent = await fs.readFile(indexPath, 'utf8')
    })

    it('should have shebang for bun', () => {
      expect(indexContent).to.match(/^#!\/usr\/bin\/env bun/)
    })

    it('should import required functions from lib', () => {
      expect(indexContent).to.include('import {')
      expect(indexContent).to.include('runHook')
      expect(indexContent).to.include("from './lib'")
      expect(indexContent).to.include("from './session'")
    })

    it('should not create sessions directory locally', () => {
      expect(indexContent).not.to.include("await mkdir('.claude/hooks/sessions'")
    })

    it('should define all handler functions', () => {
      expect(indexContent).to.match(/async\s+function\s+preToolUse/)
      expect(indexContent).to.match(/async\s+function\s+postToolUse/)
      expect(indexContent).to.match(/async\s+function\s+notification/)
      expect(indexContent).to.match(/async\s+function\s+stop/)
      expect(indexContent).to.match(/async\s+function\s+subagentStop/)
      expect(indexContent).to.match(/async\s+function\s+userPromptSubmit/)
      expect(indexContent).to.match(/async\s+function\s+preCompact/)
    })

    it('should save session data in all handlers', () => {
      expect(indexContent).to.match(/await saveSessionData\('PreToolUse', \{\.\.\.payload, hook_type: 'PreToolUse'\}/)
      expect(indexContent).to.match(/await saveSessionData\('PostToolUse', \{\.\.\.payload, hook_type: 'PostToolUse'\}/)
      expect(indexContent).to.match(
        /await saveSessionData\('Notification', \{\.\.\.payload, hook_type: 'Notification'\}/,
      )
      expect(indexContent).to.match(/await saveSessionData\('Stop', \{\.\.\.payload, hook_type: 'Stop'\}/)
      expect(indexContent).to.match(
        /await saveSessionData\('SubagentStop', \{\.\.\.payload, hook_type: 'SubagentStop'\}/,
      )
      expect(indexContent).to.match(
        /await saveSessionData\('UserPromptSubmit', \{\.\.\.payload, hook_type: 'UserPromptSubmit'\}/,
      )
      expect(indexContent).to.match(/await saveSessionData\('PreCompact', \{\.\.\.payload, hook_type: 'PreCompact'\}/)
    })

    it('should include helpful examples for TypeScript convenience', () => {
      expect(indexContent).to.include("payload.tool_name === 'Edit'")
      expect(indexContent).to.include('📝 Claude is editing:')
      expect(indexContent).to.include('🚀 Running command:')
      expect(indexContent).to.include('💬 User prompt:')
      expect(indexContent).to.include('🗜️  Compact triggered:')
      expect(indexContent).to.include('// Add your custom logic here!')
    })

    it('should call runHook with all handlers', () => {
      expect(indexContent).to.include('runHook({')
      expect(indexContent).to.include('preToolUse,')
      expect(indexContent).to.include('postToolUse,')
      expect(indexContent).to.include('notification,')
      expect(indexContent).to.include('stop')
      expect(indexContent).to.include('subagentStop')
      expect(indexContent).to.include('userPromptSubmit')
      expect(indexContent).to.include('preCompact')
    })
  })

  describe('lib.ts', () => {
    let libContent: string

    before(async () => {
      const libPath = path.join(testDir, '.claude/hooks/lib.ts')
      libContent = await fs.readFile(libPath, 'utf8')
    })

    it('should define all required types', () => {
      expect(libContent).to.include('export interface PreToolUsePayload')
      expect(libContent).to.include('export interface PostToolUsePayload')
      expect(libContent).to.include('export interface NotificationPayload')
      expect(libContent).to.include('export interface StopPayload')
      expect(libContent).to.include('export interface SubagentStopPayload')
      expect(libContent).to.include('export interface UserPromptSubmitPayload')
      expect(libContent).to.include('export interface PreCompactPayload')
      expect(libContent).to.include('export interface HookResponse')
      expect(libContent).to.include('export interface BashToolInput')
    })

    it('should export utility functions', () => {
      expect(libContent).to.include('export function log')
      expect(libContent).to.include('export function runHook')
    })

    it('should handle stdin for hook communication', () => {
      expect(libContent).to.include("process.stdin.on('data'")
      expect(libContent).to.include('JSON.parse(data.toString())')
      expect(libContent).to.include('JSON.stringify')
    })
  })

  describe('session.ts', () => {
    it('should exist with saveSessionData function', async () => {
      const sessionPath = path.join(testDir, '.claude/hooks/session.ts')
      const content = await fs.readFile(sessionPath, 'utf8')

      expect(content).to.include('export async function saveSessionData')
      expect(content).to.include('tmpdir()')
      expect(content).to.include('claude-hooks-sessions')
      expect(content).to.include('JSON.stringify(sessionData, null, 2)')
    })
  })

  describe('directory structure', () => {
    it('should have correct file permissions', async () => {
      const indexPath = path.join(testDir, '.claude/hooks/index.ts')
      const stats = await fs.stat(indexPath)

      // Check that file is readable
      expect(stats.mode & 0o400).to.be.above(0)
    })
  })
})
*/
