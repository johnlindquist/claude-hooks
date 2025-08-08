import * as os from 'node:os'
import * as path from 'node:path'
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import fs from 'fs-extra'

export default class Logs extends Command {
  static override description = `Display paths to Claude session logs

Finds and displays paths to Claude hook session logs for debugging and analysis:
• Shows the path to the most recent session log by default
• Lists all available sessions with --list flag
• Shows path to a specific session by ID with --id flag
• Session logs contain detailed hook execution data and payloads
• Logs are stored in: <system-temp-dir>/claude-hooks-sessions/`

  static override examples = [
    {
      description: 'Show path to the latest session log',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'List all session files',
      command: '<%= config.bin %> <%= command.id %> --list',
    },
    {
      description: 'Show path to a specific session by partial ID',
      command: '<%= config.bin %> <%= command.id %> --id abc123',
    },
  ]

  static override flags = {
    list: Flags.boolean({
      char: 'l',
      description: 'List all session files',
    }),
    id: Flags.string({
      char: 'i',
      description: 'Show a specific session by partial ID',
    }),
  }

  public override async run(): Promise<void> {
    const {flags} = await this.parse(Logs)

    // Get the sessions directory from temp
    const tempDir = os.tmpdir()
    const sessionsDir = path.join(tempDir, 'claude-hooks-sessions')

    // Check if sessions directory exists
    if (!(await fs.pathExists(sessionsDir))) {
      this.warn('No session logs found. The sessions directory does not exist.')
      this.log(chalk.gray(`Expected location: ${sessionsDir}`))
      return
    }

    // Get all session files
    const files = await fs.readdir(sessionsDir)
    const sessionFiles = files.filter((f) => f.endsWith('.json'))

    if (sessionFiles.length === 0) {
      this.warn('No session logs found.')
      return
    }

    // Get file stats to sort by modification time
    const fileStats = await Promise.all(
      sessionFiles.map(async (file) => {
        const filePath = path.join(sessionsDir, file)
        const stat = await fs.stat(filePath)
        return {
          file,
          path: filePath,
          mtime: stat.mtime,
          sessionId: file.replace('.json', ''),
        }
      }),
    )

    // Sort by modification time (newest first)
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    // Handle list flag
    if (flags.list) {
      this.log(chalk.blue.bold('\n📋 Session Logs:\n'))
      fileStats.forEach((stat, index) => {
        const isLatest = index === 0
        const marker = isLatest ? chalk.green('→') : ' '
        const time = stat.mtime.toLocaleString()
        this.log(`${marker} ${chalk.cyan(stat.sessionId)} ${chalk.gray(time)}`)
      })
      this.log('')
      return
    }

    // Handle id flag
    let targetFile: {file: string; path: string; mtime: Date; sessionId: string} | undefined
    if (flags.id) {
      targetFile = fileStats.find((stat) => stat.sessionId.toLowerCase().includes(flags.id!.toLowerCase()))
      if (!targetFile) {
        this.warn(chalk.red(`No session found matching ID: ${flags.id}`))
        return
      }
    } else {
      // Get the latest session
      targetFile = fileStats[0]
    }

    this.log(targetFile.path)
  }
}
