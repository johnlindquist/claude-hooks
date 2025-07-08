import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import fs from 'fs-extra'
import ora from 'ora'

export default class Init extends Command {
  static description = `Initialize Claude Code hooks in your project

This command sets up basic Claude Code hooks in your project:
• Creates settings.json with default hook configuration
• Generates index.ts with session-saving handlers for all hook types
• Creates lib.ts with base utilities for hook management
• Saves session data to system temp directory`

  static examples = [
    {
      description: 'Initialize claude hooks',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Overwrite existing hooks',
      command: '<%= config.bin %> <%= command.id %> --force',
    },
  ]

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing hooks without prompting',
      helpGroup: 'GLOBAL',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Init)

    console.log(chalk.blue.bold('\n🪝 Claude Hooks Setup\n'))

    // Check if Bun is installed
    const {spawn} = await import('node:child_process')
    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'where' : 'which'
    const checkBun = await new Promise<boolean>((resolve) => {
      const child = spawn(command, ['bun'], {shell: false})
      child.on('error', () => resolve(false))
      child.on('exit', (code) => resolve(code === 0))
    })

    if (!checkBun) {
      console.log(chalk.yellow('⚠️  Warning: Bun is not installed on your system'))
      console.log(chalk.gray('   Bun is required to run Claude hooks'))
      console.log(chalk.gray('   Install it with: curl -fsSL https://bun.sh/install | bash\n'))
    }

    // Check if hooks already exist
    if (!flags.force && (await fs.pathExists('.claude/hooks/index.ts'))) {
      console.log(chalk.yellow('Claude hooks already exist. Use --force to overwrite.'))
      return
    }

    const spinner = ora('Setting up claude hooks...').start()

    try {
      // Ensure directories exist
      await fs.ensureDir('.claude/hooks')

      // Generate hook files
      await this.generateHookFiles()

      // Update or create settings.json
      await this.updateSettings()

      // Run bun install to install dependencies
      spinner.text = 'Installing dependencies...'
      await this.runBunInstall()

      spinner.succeed('Hooks setup complete!')

      // Success message
      console.log(chalk.green('\n✨ Claude Code hooks initialized!\n'))
      console.log(chalk.gray('Next steps:'))
      console.log(chalk.gray('1. Ensure Bun is installed (Bun is required to run Claude hooks)'))
      console.log(chalk.gray('2. Edit .claude/hooks/index.ts to customize hook behavior'))
      console.log(chalk.gray('3. Test your hooks by using Claude Code\n'))
    } catch (error) {
      spinner.fail('Failed to setup hooks')

      // Provide more detailed error messages
      if (error instanceof Error) {
        if (error.message.includes('EACCES') || error.message.includes('permission')) {
          console.error(chalk.red('\n❌ Permission Error:'))
          console.error(chalk.yellow('   You do not have permission to write to this directory.'))
          console.error(chalk.gray('   Try running with elevated permissions or check directory ownership.'))
        } else if (error.message.includes('ENOENT')) {
          console.error(chalk.red('\n❌ Path Error:'))
          console.error(chalk.yellow('   Could not find or create the required directories.'))
        } else {
          console.error(chalk.red('\n❌ Error:'), error.message)
        }
      } else {
        console.error(chalk.red('\n❌ Unknown error:'), error)
      }

      process.exit(1)
    }
  }

  private async generateHookFiles(): Promise<void> {
    // Get templates directory path
    const distDir = path.dirname(fileURLToPath(import.meta.url))
    const rootDir = path.join(distDir, '..', '..')
    const templatesDir = path.join(rootDir, 'templates')

    // Copy all hook template files
    await fs.copy(path.join(templatesDir, 'hooks', 'lib.ts'), '.claude/hooks/lib.ts')
    await fs.copy(path.join(templatesDir, 'hooks', 'session.ts'), '.claude/hooks/session.ts')
    await fs.copy(path.join(templatesDir, 'hooks', 'index.ts'), '.claude/hooks/index.ts')

    // Copy TypeScript configuration files
    await fs.copy(path.join(templatesDir, 'hooks', 'package.json'), '.claude/hooks/package.json')
    await fs.copy(path.join(templatesDir, 'hooks', 'tsconfig.json'), '.claude/hooks/tsconfig.json')
    await fs.copy(path.join(templatesDir, 'hooks', '.gitignore'), '.claude/hooks/.gitignore')
  }

  private async runBunInstall(): Promise<void> {
    const {spawn} = await import('node:child_process')

    return new Promise((resolve, reject) => {
      const child = spawn('bun', ['install'], {
        cwd: '.claude/hooks',
        stdio: 'pipe',
        shell: false,
      })

      let _stderr = ''

      child.stderr?.on('data', (data) => {
        _stderr += data.toString()
      })

      child.on('error', (error) => {
        // If bun is not installed, we continue anyway
        if (error.message.includes('ENOENT')) {
          resolve()
        } else {
          reject(new Error(`Failed to run bun install: ${error.message}`))
        }
      })

      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          // Non-zero exit code but not a critical failure
          // User can manually run bun install later
          resolve()
        }
      })
    })
  }

  private async updateSettings(): Promise<void> {
    const settingsPath = '.claude/settings.json'
    let settings: any = {}

    try {
      const existingSettings = await fs.readFile(settingsPath, 'utf-8')
      settings = JSON.parse(existingSettings)
    } catch (error) {
      // File doesn't exist or is invalid JSON
      if (error instanceof Error && error.message.includes('JSON')) {
        console.log(chalk.yellow('⚠️  Warning: Existing settings.json contains invalid JSON. Creating new settings.'))
      }
      // Continue with empty settings object
    }

    // Set the hooks configuration with the default structure
    settings.hooks = {
      Notification: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'bun .claude/hooks/index.ts Notification',
            },
          ],
        },
      ],
      Stop: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'bun .claude/hooks/index.ts Stop',
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'bun .claude/hooks/index.ts PreToolUse',
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'bun .claude/hooks/index.ts PostToolUse',
            },
          ],
        },
      ],
    }

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
  }
}
