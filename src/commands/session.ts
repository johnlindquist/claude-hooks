import * as os from 'node:os'
import * as path from 'node:path'
import {spawn} from 'node:child_process'
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import fs from 'fs-extra'

export default class Session extends Command {
  static description = `Open the latest Claude session log

This command finds and opens the most recent session log file from the system temp directory.`

  static examples = [
    {
      description: 'Open the latest session log',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'List all session files without opening',
      command: '<%= config.bin %> <%= command.id %> --list',
    },
    {
      description: 'Open a specific session by partial ID',
      command: '<%= config.bin %> <%= command.id %> --id abc123',
    },
  ]

  static flags = {
    list: Flags.boolean({
      char: 'l',
      description: 'List all session files without opening',
    }),
    id: Flags.string({
      char: 'i',
      description: 'Open a specific session by partial ID',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Session)

    // Get the sessions directory from temp
    const tempDir = os.tmpdir()
    const sessionsDir = path.join(tempDir, 'claude-hooks-sessions')

    // Check if sessions directory exists
    if (!(await fs.pathExists(sessionsDir))) {
      console.log(chalk.yellow('No session logs found. The sessions directory does not exist.'))
      console.log(chalk.gray(`Expected location: ${sessionsDir}`))
      return
    }

    // Get all session files
    const files = await fs.readdir(sessionsDir)
    const sessionFiles = files.filter(f => f.endsWith('.json'))

    if (sessionFiles.length === 0) {
      console.log(chalk.yellow('No session logs found.'))
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
      })
    )

    // Sort by modification time (newest first)
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    // Handle list flag
    if (flags.list) {
      console.log(chalk.blue.bold('\n📋 Session Logs:\n'))
      fileStats.forEach((stat, index) => {
        const isLatest = index === 0
        const marker = isLatest ? chalk.green('→') : ' '
        const time = stat.mtime.toLocaleString()
        console.log(`${marker} ${chalk.cyan(stat.sessionId)} ${chalk.gray(time)}`)
      })
      console.log()
      return
    }

    // Handle id flag
    let targetFile
    if (flags.id) {
      targetFile = fileStats.find(stat => 
        stat.sessionId.toLowerCase().includes(flags.id!.toLowerCase())
      )
      if (!targetFile) {
        console.log(chalk.red(`No session found matching ID: ${flags.id}`))
        return
      }
    } else {
      // Get the latest session
      targetFile = fileStats[0]
    }

    console.log(chalk.blue(`Opening session: ${targetFile.sessionId}`))
    console.log(chalk.gray(`Path: ${targetFile.path}`))

    // Open the file with the default system editor
    await this.openFile(targetFile.path)
  }

  private async openFile(filePath: string): Promise<void> {
    const platform = process.platform
    let command: string
    let args: string[]

    switch (platform) {
      case 'darwin': // macOS
        command = 'open'
        args = [filePath]
        break
      case 'win32': // Windows
        command = 'cmd'
        args = ['/c', 'start', '""', filePath]
        break
      default: // Linux and others
        command = 'xdg-open'
        args = [filePath]
        break
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'ignore',
        detached: true,
      })

      child.on('error', (error) => {
        console.error(chalk.red('Failed to open file:'), error.message)
        console.log(chalk.gray('You can manually open the file at:'))
        console.log(chalk.cyan(filePath))
        reject(error)
      })

      child.unref()
      resolve()
    })
  }
}