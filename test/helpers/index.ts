import * as path from 'node:path'
import * as fs from 'fs-extra'

export const TEST_TIMEOUT = 10000

export async function createTestDirectory(name: string): Promise<string> {
  const testDir = path.join(__dirname, '..', '..', `test-${name}-${Date.now()}`)
  await fs.ensureDir(testDir)
  return testDir
}

export async function cleanupTestDirectory(dir: string): Promise<void> {
  await fs.remove(dir)
}

export async function verifyHooksStructure(dir: string): Promise<{
  hasSettings: boolean
  hasIndex: boolean
  hasLib: boolean
  hasGitignore: boolean
  hasSessions: boolean
}> {
  return {
    hasSettings: await fs.pathExists(path.join(dir, '.claude/settings.json')),
    hasIndex: await fs.pathExists(path.join(dir, '.claude/hooks/index.ts')),
    hasLib: await fs.pathExists(path.join(dir, '.claude/hooks/lib.ts')),
    hasGitignore: await fs.pathExists(path.join(dir, '.claude/hooks/.gitignore')),
    hasSessions: await fs.pathExists(path.join(dir, '.claude/hooks/sessions')),
  }
}

export function expectHooksContent(
  content: string,
  options: {
    hasPreToolUse?: boolean
    hasPostToolUse?: boolean
    hasNotification?: boolean
    hasStop?: boolean
    hasSecurityPatterns?: boolean
    hasProductionPatterns?: boolean
  }
): void {
  if (options.hasPreToolUse) {
    expect(content).to.include('function preToolUse')
  }
  if (options.hasPostToolUse) {
    expect(content).to.include('function postToolUse')
  }
  if (options.hasNotification) {
    expect(content).to.include('function notification')
  }
  if (options.hasStop) {
    expect(content).to.include('function stop')
  }
  if (options.hasSecurityPatterns) {
    expect(content).to.include('DANGEROUS_FILE_OPS')
    expect(content).to.include('SECRET_PATTERNS')
  }
  if (options.hasProductionPatterns) {
    expect(content).to.include('PRODUCTION_PATTERNS')
  }
}
