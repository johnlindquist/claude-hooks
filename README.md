# claude-hooks

[![Version](https://img.shields.io/npm/v/claude-hooks.svg)](https://npmjs.org/package/claude-hooks)
[![License](https://img.shields.io/npm/l/claude-hooks.svg)](https://github.com/johnlindquist/claude-hooks/blob/main/LICENSE)

> Simple CLI to initialize Claude Code hooks in your project

## Overview

`claude-hooks` is a straightforward CLI tool that sets up Claude Code hooks in your project. It creates the necessary files and configuration to intercept and log Claude's tool usage, with basic security protection against dangerous commands.

## Quick Start

```bash
npx claude-hooks
```

This will:
- Create `.claude/settings.json` with hook configuration
- Generate `.claude/hooks/index.ts` with default handlers
- Set up session logging in system temp directory
- Create supporting files (lib.ts and session.ts)

## Installation

### Using npx (Recommended)

```bash
npx claude-hooks
```

### Global Installation

```bash
npm install -g claude-hooks
claude-hooks
```

## What It Does

The CLI generates a basic hook setup that:

1. **Logs all Claude interactions** - Saves session data for all hook types (PreToolUse, PostToolUse, Notification, Stop) to the system temp directory
2. **Blocks dangerous commands** - Prevents `rm -rf /` and `rm -rf ~` commands
3. **Creates necessary files**:
   - `.claude/settings.json` - Hook configuration
   - `.claude/hooks/index.ts` - Hook handlers
   - `.claude/hooks/lib.ts` - Base utilities and types
   - `.claude/hooks/session.ts` - Session logging utilities

## Generated Structure

```
.claude/
├── settings.json
└── hooks/
    ├── index.ts
    ├── lib.ts
    └── session.ts
```

Session logs are saved to: `<system-temp-dir>/claude-hooks-sessions/`

## Customizing Hooks

After running the setup, you can edit `.claude/hooks/index.ts` to add your own logic:

```typescript
// Example: Block additional dangerous commands
if (command && command.includes('DROP DATABASE')) {
  return {
    action: 'block',
    stopReason: 'Database drop commands are not allowed'
  };
}
```

## Command Options

```bash
claude-hooks init [OPTIONS]

OPTIONS:
  -f, --force    Overwrite existing hooks
  -h, --help     Show help
```

## Requirements

- Node.js >= 18.0.0
- **[Bun](https://bun.sh)** - Required to run the hooks
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

## License

MIT