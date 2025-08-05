import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Command, Flags} from '@oclif/core'

export default class Init extends Command {
  static override description = 'Initialize Claude hooks in your project'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --settings=custom-settings.json',
    '<%= config.bin %> <%= command.id %> --force',
  ]

  static override flags = {
    settings: Flags.string({
      char: 's',
      description: 'Settings file name',
      default: 'settings.json',
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing hooks',
      default: false,
    }),
  }

  private readonly HOOK_TYPES = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionStart'] as const

  public async run(): Promise<void> {
    const {flags} = await this.parse(Init)

    const claudeDir = path.join(process.cwd(), '.claude')
    const hooksDir = path.join(claudeDir, 'hooks')
    const settingsPath = path.join(claudeDir, flags.settings)

    // Check existing hooks
    if (!flags.force && this.hasExistingHooks(hooksDir)) {
      this.error('Hooks already exist. Use --force to overwrite.')
    }

    // Create directories
    this.createDirectories([claudeDir, hooksDir])

    // Copy hook files
    this.copyHookFiles(hooksDir)

    // Find Bun executable
    const bunPath = this.findBunExecutable()
    if (!bunPath) {
      this.error('Bun is not installed or not in PATH. Please install Bun from https://bun.sh')
    }

    // Create settings file
    this.createSettingsFile(settingsPath, hooksDir, bunPath)

    // Success message
    this.displaySuccessMessage(flags.settings)
  }

  private hasExistingHooks(hooksDir: string): boolean {
    return fs.existsSync(path.join(hooksDir, 'index.ts'))
  }

  private createDirectories(directories: string[]): void {
    for (const dir of directories) {
      fs.mkdirSync(dir, {recursive: true})
    }
  }

  private copyHookFiles(hooksDir: string): void {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    
    // When running compiled JS, we're in dist/commands, so go up two levels
    // When running from source, we're in src/commands, so go up two levels
    // In both cases, templates is at the root
    const projectRoot = path.join(__dirname, '..', '..')
    const templatesDir = path.join(projectRoot, 'templates', 'hooks')

    const filesToCopy = ['index.ts', 'lib.ts', 'session.ts']

    for (const file of filesToCopy) {
      const sourcePath = path.join(templatesDir, file)
      const destPath = path.join(hooksDir, file)

      try {
        fs.copyFileSync(sourcePath, destPath)
      } catch (error) {
        this.error(`Failed to copy ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  private findBunExecutable(): string | null {
    // First, try to find Bun in common locations
    const commonPaths = [
      '/usr/local/bin/bun',
      '/usr/bin/bun',
      '/opt/homebrew/bin/bun',
      path.join(process.env.HOME || '', '.bun', 'bin', 'bun'),
    ]

    for (const bunPath of commonPaths) {
      if (fs.existsSync(bunPath)) {
        try {
          execSync(`"${bunPath}" --version`, {stdio: 'ignore'})
          return bunPath
        } catch {
          // Continue to next path
        }
      }
    }

    // Try to find Bun using 'which' or 'where' command
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which'
      const result = execSync(`${cmd} bun`, {encoding: 'utf-8'}).trim()
      if (result) {
        return result.split('\n')[0] // Take first result on Windows
      }
    } catch {
      // Bun not found in PATH
    }

    // Last resort: check if 'bun' command works directly
    try {
      execSync('bun --version', {stdio: 'ignore'})
      return 'bun' // Use just 'bun' if it's in PATH
    } catch {
      return null
    }
  }

  private createSettingsFile(settingsPath: string, hooksDir: string, bunPath: string): void {
    const settings = {
      hooks: this.HOOK_TYPES.reduce(
        (acc, hookType) => {
          acc[hookType] = {
            command: bunPath,
            args: [path.join(hooksDir, 'index.ts')],
          }
          return acc
        },
        {} as Record<string, {command: string; args: string[]}>,
      ),
    }

    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    } catch (error) {
      this.error(`Failed to create settings file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private displaySuccessMessage(settingsFileName: string): void {
    this.log('\n✨ Claude hooks initialized successfully!')
    this.log('\nNext steps:')
    this.log('1. Edit .claude/hooks/index.ts to customize your hooks')
    this.log(`2. Your hooks are already configured in .claude/${settingsFileName}`)
    this.log('\nExample hook implementation:')
    this.log(`
export const PreToolUse: HookHandler = (args) => {
  if (args.toolName === 'Bash' && args.toolArgs?.command?.includes('rm -rf')) {
    return {
      block: true,
      message: "Blocked dangerous command"
    }
  }
}`)
    this.log('\nFor more information, visit: https://github.com/johnlindquist/claude-hooks')
  }
}