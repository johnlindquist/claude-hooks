import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import fs from 'fs-extra'
import ora from 'ora'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
    const { flags } = await this.parse(Init)

    console.log(chalk.blue.bold('\n🪝 Claude Hooks Setup\n'))

    // Check if Bun is installed
    try {
      await fs.access('/usr/bin/bun')
    } catch {
      try {
        await fs.access('/usr/local/bin/bun')
      } catch {
        console.log(chalk.yellow('⚠️  Warning: Bun is not installed on your system'))
        console.log(chalk.gray('   Bun is required to run Claude hooks'))
        console.log(chalk.gray('   Install it with: curl -fsSL https://bun.sh/install | bash\n'))
      }
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

      // No need to update .gitignore since we're using tmp directory

      spinner.succeed('Hooks setup complete!')

      // Success message
      console.log(chalk.green('\n✨ Claude Code hooks initialized!\n'))
      console.log(chalk.gray('Next steps:'))
      console.log(chalk.gray('1. Ensure Bun is installed (see warning above if not)'))
      console.log(chalk.gray('2. Edit .claude/hooks/index.ts to customize hook behavior'))
      console.log(chalk.gray('3. Test your hooks by using Claude Code\n'))
    } catch (error) {
      spinner.fail('Failed to setup hooks')
      console.error(chalk.red('\nError:'), error)
      process.exit(1)
    }
  }

  private async generateHookFiles(): Promise<void> {
    // Copy lib.ts
    const distDir = path.dirname(fileURLToPath(import.meta.url))
    const rootDir = path.join(distDir, '..', '..')
    const templatesDir = path.join(rootDir, 'templates')
    await fs.copy(path.join(templatesDir, 'hooks', 'lib.ts'), '.claude/hooks/lib.ts')

    // Add session.ts with the saveSessionData function
    const sessionContent = `import { mkdir } from 'node:fs/promises';
import { writeFile, readFile } from 'node:fs/promises';
import * as path from 'path';
import { tmpdir } from 'node:os';

const SESSIONS_DIR = path.join(tmpdir(), 'claude-hooks-sessions');

export async function saveSessionData(hookType: string, payload: any): Promise<void> {
  try {
    // Ensure sessions directory exists
    await mkdir(SESSIONS_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString();
    const sessionFile = path.join(SESSIONS_DIR, \`\${payload.session_id}.json\`);
    
    let sessionData: any[] = [];
    try {
      const existing = await readFile(sessionFile, 'utf-8');
      sessionData = JSON.parse(existing);
    } catch {
      // File doesn't exist yet
    }
    
    sessionData.push({
      timestamp,
      hookType,
      payload
    });
    
    await writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
  } catch (error) {
    console.error('Failed to save session data:', error);
  }
}
`
    await fs.writeFile('.claude/hooks/session.ts', sessionContent)

    // Generate default index.ts
    const indexContent = `#!/usr/bin/env bun

import { runHook, log, type PreToolUsePayload, type PostToolUsePayload, type NotificationPayload, type StopPayload, type HookResponse, type BashToolInput } from './lib';
import { saveSessionData } from './session';

// PreToolUse handler - validate and potentially block dangerous commands
async function preToolUse(payload: PreToolUsePayload): Promise<HookResponse> {
  // Save session data
  await saveSessionData('PreToolUse', payload);
  
  // Example: Block dangerous commands
  if (payload.tool_name === 'Bash' && payload.tool_input && 'command' in payload.tool_input) {
    const bashInput = payload.tool_input as BashToolInput;
    const command = bashInput.command;
    
    // Block rm -rf commands
    if (command && (command.includes('rm -rf /') || command.includes('rm -rf ~'))) {
      return {
        action: 'block',
        stopReason: 'Dangerous command detected: rm -rf on system directories'
      };
    }
  }
  
  // Allow all other commands
  return { action: 'continue' };
}

// PostToolUse handler - log tool results
async function postToolUse(payload: PostToolUsePayload): Promise<void> {
  await saveSessionData('PostToolUse', payload);
}

// Notification handler - log notifications
async function notification(payload: NotificationPayload): Promise<void> {
  await saveSessionData('Notification', payload);
}

// Stop handler - log session end
async function stop(payload: StopPayload): Promise<void> {
  await saveSessionData('Stop', payload);
}

// Run the hook with our handlers
runHook({
  preToolUse,
  postToolUse,
  notification,
  stop
});
`
    await fs.writeFile('.claude/hooks/index.ts', indexContent)
  }

  private async updateSettings(): Promise<void> {
    const settingsPath = '.claude/settings.json'
    let settings: any = {}

    try {
      const existingSettings = await fs.readFile(settingsPath, 'utf-8')
      settings = JSON.parse(existingSettings)
    } catch {
      // File doesn't exist or is invalid
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
