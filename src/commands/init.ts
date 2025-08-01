import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import fs from 'fs-extra'
import inquirer from 'inquirer'
import ora from 'ora'

export default class Init extends Command {
  static description = `Initialize Claude Code hooks in your project

Sets up a TypeScript-powered hook system for Claude Code with full type safety:
• Creates settings.json (or settings.json.local with --local flag) with hook configuration
• Generates index.ts with TypeScript handlers for all hook types (PreToolUse, PostToolUse, Notification, Stop, SubagentStop, UserPromptSubmit, PreCompact)
• Creates lib.ts with strongly-typed payload interfaces and utilities
• Sets up session.ts for optional session tracking
• Initializes a Bun project with TypeScript configuration
• Saves session data to system temp directory

Requirements:
• Node.js >= 18.0.0
• Bun runtime (https://bun.sh)`

  static examples = [
    {
      description: 'Initialize claude hooks',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Overwrite existing hooks',
      command: '<%= config.bin %> <%= command.id %> --force',
    },
    {
      description: 'Create local settings file',
      command: '<%= config.bin %> <%= command.id %> --local',
    },
  ]

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing hooks without prompting',
      helpGroup: 'GLOBAL',
    }),
    local: Flags.boolean({
      char: 'l',
      description: 'Create settings.json.local instead of settings.json',
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
    const indexPath = '.claude/hooks/index.ts'
    const hooksExist = await fs.pathExists(indexPath)

    if (hooksExist && !flags.force) {
      console.log(chalk.yellow('Claude hooks already exist. Use --force to overwrite.'))
      return
    }

    // If using --force and hooks exist, prompt for backup
    if (hooksExist && flags.force) {
      const {shouldBackup} = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldBackup',
          message: 'Would you like to backup your existing index.ts customizations?',
          default: true,
        },
      ])

      if (shouldBackup) {
        await this.backupIndexFile(indexPath)
      }
    }

    const spinner = ora('Setting up claude hooks...').start()

    try {
      // Ensure directories exist
      await fs.ensureDir('.claude/hooks')

      // Generate hook files
      await this.generateHookFiles()

      // Update or create settings.json
      await this.updateSettings(flags.local)

      // Install required dependencies
      spinner.text = 'Installing dependencies...'
      await this.installDependencies()

      spinner.succeed('Hooks setup complete!')

      // Success message
      console.log(chalk.green('\n✨ Claude Code hooks initialized!\n'))
      if (flags.local) {
        console.log(chalk.yellow('📝 Created settings.json.local for personal configuration\n'))
      }
      console.log(chalk.gray('Next steps:'))
      console.log(chalk.gray('1. Ensure Bun is installed (Bun is required to run Claude hooks)'))
      console.log(chalk.gray('2. Edit .claude/hooks/index.ts to customize hook behavior'))
      console.log(chalk.gray('3. Test your hooks by using Claude Code\n'))
    } catch (error) {
      spinner.fail('Failed to setup hooks')

      // Provide more detailed error messages
      if (error instanceof Error) {
        if (error.message.includes('Bun is not installed')) {
          console.error(chalk.red('\n❌ Bun Not Found:'))
          console.error(chalk.yellow('   Bun is required to initialize the hook system.'))
          console.error(chalk.gray('   Please install Bun first:'))
          console.error(chalk.cyan('   curl -fsSL https://bun.sh/install | bash'))
          console.error(chalk.gray('\n   After installing, make sure Bun is in your PATH and run this command again.'))
        } else if (error.message.includes('EACCES') || error.message.includes('permission')) {
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

  private async backupIndexFile(indexPath: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const backupPath = `.claude/hooks/index.backup.${timestamp}.ts`

    try {
      await fs.copy(indexPath, backupPath)
      console.log(chalk.green(`✅ Backed up existing index.ts to ${backupPath}`))
    } catch (error) {
      console.error(chalk.red('❌ Failed to backup index.ts:'), error)
      throw error
    }
  }

  private async generateHookFiles(): Promise<void> {
    // Get templates directory path
    const distDir = path.dirname(fileURLToPath(import.meta.url))
    const rootDir = path.join(distDir, '..', '..')
    const templatesDir = path.join(rootDir, 'templates')

    // First, run bun init to create a proper TypeScript project
    await this.runBunInit()

    // Then copy our hook template files
    await fs.copy(path.join(templatesDir, 'hooks', 'lib.ts'), '.claude/hooks/lib.ts')
    await fs.copy(path.join(templatesDir, 'hooks', 'session.ts'), '.claude/hooks/session.ts')
    await fs.copy(path.join(templatesDir, 'hooks', 'index.ts'), '.claude/hooks/index.ts')
  }

  private async runBunInit(): Promise<void> {
    const {spawn} = await import('node:child_process')

    return new Promise((resolve, reject) => {
      const child = spawn('bun', ['init', '-y'], {
        cwd: '.claude/hooks',
        stdio: 'pipe',
        shell: false,
      })

      let _stderr = ''

      child.stderr?.on('data', (data) => {
        _stderr += data.toString()
      })

      child.on('error', (error) => {
        if (error.message.includes('ENOENT')) {
          reject(new Error('Bun is not installed. Please install Bun first: https://bun.sh'))
        } else {
          reject(new Error(`Failed to run bun init: ${error.message}`))
        }
      })

      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`bun init failed with exit code ${code}: ${_stderr}`))
        }
      })
    })
  }

  private async installDependencies(): Promise<void> {
    const {spawn} = await import('node:child_process')

    // Install required type definitions
    return new Promise((resolve, reject) => {
      const child = spawn('bun', ['add', '-d', '@types/node'], {
        cwd: '.claude/hooks',
        stdio: 'pipe',
        shell: false,
      })

      let _stderr = ''

      child.stderr?.on('data', (data) => {
        _stderr += data.toString()
      })

      child.on('error', (error) => {
        // If bun is not installed, we've already warned about it
        if (error.message.includes('ENOENT')) {
          resolve()
        } else {
          reject(new Error(`Failed to install dependencies: ${error.message}`))
        }
      })

      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          // Non-zero exit code but not a critical failure
          // User can manually install dependencies later
          resolve()
        }
      })
    })
  }

  private async updateSettings(useLocal = false): Promise<void> {
    const settingsPath = useLocal ? '.claude/settings.json.local' : '.claude/settings.json'
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
      SubagentStop: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'bun .claude/hooks/index.ts SubagentStop',
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'bun .claude/hooks/index.ts UserPromptSubmit',
            },
          ],
        },
      ],
      PreCompact: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'bun .claude/hooks/index.ts PreCompact',
            },
          ],
        },
      ],
    }

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
  }
}
