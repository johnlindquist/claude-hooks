import {execSync} from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect} from 'chai'
import fs from 'fs-extra'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Smoke Tests - Generated Files', () => {
  let testDir: string
  const binPath = path.join(__dirname, '..', '..', 'bin', 'run.js')

  before(async () => {
    // Create isolated test directory
    testDir = path.join(os.tmpdir(), `claude-hooks-smoke-${Date.now()}`)
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

      // Check hook structure for new format
      const hookTypes = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionStart']
      for (const hookType of hookTypes) {
        expect(settings.hooks[hookType]).to.be.an('object')
        expect(settings.hooks[hookType]).to.have.property('command')
        expect(settings.hooks[hookType]).to.have.property('args')
        expect(settings.hooks[hookType].args).to.be.an('array')
        expect(settings.hooks[hookType].args[0]).to.include('index.ts')
      }
    })

    it('should use absolute bun path in commands', async () => {
      const settingsPath = path.join(testDir, '.claude/settings.json')
      const settings = await fs.readJson(settingsPath)

      const bunCommand = settings.hooks.PreToolUse.command
      expect(bunCommand).to.satisfy((cmd: string) => path.isAbsolute(cmd) || cmd === 'bun')
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
      expect(indexContent).to.include('import')
      expect(indexContent).to.include('runHooks')
      expect(indexContent).to.include('HookHandler')
      expect(indexContent).to.include("from './lib'")
    })

    it('should define handler functions with correct types', () => {
      expect(indexContent).to.match(/export const PreToolUse:\s*HookHandler/)
      expect(indexContent).to.match(/export const PostToolUse:\s*HookHandler/)
      expect(indexContent).to.match(/export const Notification:\s*HookHandler/)
      expect(indexContent).to.match(/export const Stop:\s*HookHandler/)
      expect(indexContent).to.match(/export const SessionStart:\s*HookHandler/)
    })

    it('should include helpful examples', () => {
      expect(indexContent).to.include("toolName === 'Edit'")
      expect(indexContent).to.include('📝 Claude is editing:')
      expect(indexContent).to.include("toolName === 'Bash'")
      expect(indexContent).to.include('🚀 Running command:')
    })

    it('should call runHooks with all handlers', () => {
      expect(indexContent).to.include('runHooks({')
      expect(indexContent).to.include('PreToolUse')
      expect(indexContent).to.include('PostToolUse')
      expect(indexContent).to.include('Notification')
      expect(indexContent).to.include('Stop')
      expect(indexContent).to.include('SessionStart')
    })
  })

  describe('lib.ts', () => {
    let libContent: string

    before(async () => {
      const libPath = path.join(testDir, '.claude/hooks/lib.ts')
      libContent = await fs.readFile(libPath, 'utf8')
    })

    it('should define HookArgs interface with all hook types', () => {
      expect(libContent).to.include('export interface HookArgs')
      expect(libContent).to.include("type: 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop' | 'SessionStart'")
      expect(libContent).to.include('toolName?: string')
      expect(libContent).to.include('toolArgs?: unknown')
      expect(libContent).to.include('toolResult?: unknown')
      expect(libContent).to.include('message?: string')
      expect(libContent).to.include('sessionId?: string')
    })

    it('should define HookResult interface', () => {
      expect(libContent).to.include('export interface HookResult')
      expect(libContent).to.include('block?: boolean')
      expect(libContent).to.include('message?: string')
      expect(libContent).to.include('toolArgs?: unknown')
    })

    it('should export transcript utility functions', () => {
      expect(libContent).to.include('export function getTranscript()')
      expect(libContent).to.include('export function getTranscriptStream()')
      expect(libContent).to.include('export function searchTranscript(')
      expect(libContent).to.include('export function getLastNMessages(')
      expect(libContent).to.include('export function findToolUsage(')
    })

    it('should implement robust STDIN handling', () => {
      expect(libContent).to.include("process.stdin.on('data'")
      expect(libContent).to.include("process.stdin.on('end'")
      expect(libContent).to.include('inputBuffer +=')
      expect(libContent).to.include('JSON.parse(inputBuffer)')
    })

    it('should include transcript caching', () => {
      expect(libContent).to.include('transcriptCache')
      expect(libContent).to.include('CACHE_TTL')
      expect(libContent).to.include('lastRead')
    })
  })

  describe('session.ts', () => {
    it('should exist with session tracking utilities', async () => {
      const sessionPath = path.join(testDir, '.claude/hooks/session.ts')
      const exists = await fs.pathExists(sessionPath)
      expect(exists).to.be.true

      const content = await fs.readFile(sessionPath, 'utf8')
      expect(content).to.include('export')
    })
  })

  describe('Runtime execution test', () => {
    it('should handle PreToolUse hook without errors', async function() {
      const hooksPath = path.join(testDir, '.claude/hooks/index.ts')
      const testInput = JSON.stringify({
        type: 'PreToolUse',
        toolName: 'Edit',
        toolArgs: {file_path: 'test.js', old_string: 'foo', new_string: 'bar'},
      })

      try {
        const output = execSync(`bun ${hooksPath}`, {
          input: testInput,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        // Should either return empty (no blocking) or valid JSON
        if (output.trim()) {
          const result = JSON.parse(output)
          expect(result).to.be.an('object')
        }
      } catch (error: any) {
        // If bun is not available, skip this test
        if (error.message.includes('bun: not found') || error.message.includes('bun: command not found')) {
          this.skip()
        } else {
          throw error
        }
      }
    })
  })
})