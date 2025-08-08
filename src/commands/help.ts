import {Args, Command} from '@oclif/core'
import chalk from 'chalk'

export default class Help extends Command {
  static override description = 'Display help for claude-hooks'

  static override args = {
    command: Args.string({
      description: 'Command to show help for',
      required: false,
    }),
  }

  override async run(): Promise<void> {
    const {args} = await this.parse(Help)

    if (args.command) {
      // Show help for specific command
      const cmd = this.config.findCommand(args.command)
      if (!cmd) {
        this.warn(`Command ${args.command} not found`)
        return
      }
      await this.config.runCommand('help', [args.command])
      return
    }

    // Show root help with our custom formatting
    this.log(chalk.blue.bold('\n🪝 claude-hooks'))
    this.log(
      chalk.gray(
        '\nTypeScript-powered hook system for Claude Code - write hooks with full type safety and auto-completion',
      ),
    )

    this.log(chalk.yellow('\n📋 Overview:'))
    this.log("  claude-hooks gives you a powerful, TypeScript-based way to customize Claude Code's behavior.")
    this.log('  Write hooks with full type safety, auto-completion, and access to strongly-typed payloads.')

    this.log(chalk.yellow('\n🚀 Quick Start:'))
    this.log(chalk.cyan('  npx claude-hooks'))
    this.log(chalk.gray('  # This will create the following structure:'))

    this.log(chalk.yellow('\n📁 Generated Structure:'))
    this.log('  .claude/')
    this.log(`  ├── settings.json         ${chalk.gray('# Hook configuration')}`)
    this.log('  └── hooks/')
    this.log(`      ├── index.ts          ${chalk.gray('# Your hook handlers (edit this!)')}`)
    this.log(`      ├── lib.ts            ${chalk.gray('# Type definitions and utilities')}`)
    this.log(`      └── session.ts        ${chalk.gray('# Session tracking utilities')}`)

    this.log(chalk.yellow('\n🛠️  Requirements:'))
    this.log('  • Node.js >= 18.0.0')
    this.log('  • Bun runtime (required for running hooks)')
    this.log(chalk.gray('    Install: curl -fsSL https://bun.sh/install | bash'))

    this.log(chalk.yellow('\n🪝 Available Hook Types:'))
    this.log('  • PreToolUse    - Intercept tool usage before execution')
    this.log('  • PostToolUse   - React to tool execution results')
    this.log('  • Notification  - Handle Claude notifications')
    this.log('  • Stop          - Handle session stop events')
    this.log('  • SessionStart  - Handle new session start events')

    this.log(chalk.yellow('\n📝 Commands:'))
    this.log(chalk.cyan(`  ${this.config.bin} init`) + chalk.gray('      # Initialize Claude hooks in your project'))
    this.log(chalk.cyan(`  ${this.config.bin} logs`) + chalk.gray('      # Display paths to Claude session logs'))
    this.log(chalk.cyan(`  ${this.config.bin} help`) + chalk.gray('      # Show this help message'))

    this.log(chalk.yellow('\n💡 Examples:'))
    this.log(chalk.gray('  Initialize hooks:'))
    this.log(`    ${this.config.bin} init`)
    this.log('')
    this.log(chalk.gray('  Force overwrite existing hooks:'))
    this.log(`    ${this.config.bin} init --force`)
    this.log('')
    this.log(chalk.gray('  Create local settings file:'))
    this.log(`    ${this.config.bin} init --local`)
    this.log('')
    this.log(chalk.gray('  Show path to latest session log:'))
    this.log(`    ${this.config.bin} logs`)
    this.log('')
    this.log(chalk.gray('  List all session logs:'))
    this.log(`    ${this.config.bin} logs --list`)

    this.log(chalk.yellow('\n📚 More Information:'))
    this.log('  GitHub: https://github.com/johnlindquist/claude-hooks')
    this.log('  Issues: https://github.com/johnlindquist/claude-hooks/issues')
    this.log('')
  }
}
