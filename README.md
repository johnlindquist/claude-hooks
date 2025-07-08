# claude-hooks

[![Version](https://img.shields.io/npm/v/claude-hooks.svg)](https://npmjs.org/package/claude-hooks)
[![License](https://img.shields.io/npm/l/claude-hooks.svg)](https://github.com/johnlindquist/claude-hooks/blob/main/LICENSE)
[![CI](https://github.com/johnlindquist/claude-hooks/actions/workflows/test.yml/badge.svg)](https://github.com/johnlindquist/claude-hooks/actions/workflows/test.yml)

> TypeScript-powered hook system for Claude Code - write hooks with full type safety and auto-completion

## Overview

`claude-hooks` gives you a powerful, TypeScript-based way to customize Claude Code's behavior. Write hooks with full type safety, auto-completion, and access to strongly-typed payloads - all in familiar TypeScript syntax. No more guessing payload structures or dealing with untyped data!

## Requirements

- [Bun](https://bun.sh) runtime (required for running hooks)
- Node.js 18+ (for running the CLI)

## Quick Start

```bash
npx claude-hooks
```

This will:
- Create `.claude/settings.json` with hook configuration
- Generate `.claude/hooks/index.ts` with TypeScript handlers
- Set up typed payload interfaces for all hook types
- Create utilities for easy hook development

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

The CLI sets up a complete TypeScript development environment for Claude hooks:

1. **Full TypeScript Support** - Write hooks with complete type safety and IntelliSense
2. **Typed Payloads** - Access strongly-typed payload data for all hook types (PreToolUse, PostToolUse, Notification, Stop)
3. **Ready-to-Customize** - Simple, clean TypeScript files ready for your custom logic
4. **Generated Files**:
   - `.claude/settings.json` - Hook configuration
   - `.claude/hooks/index.ts` - Your main hook handlers (edit this!)
   - `.claude/hooks/lib.ts` - Type definitions and utilities
   - `.claude/hooks/session.ts` - Optional session tracking utilities

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

The real power comes from editing `.claude/hooks/index.ts`. You get full TypeScript support with typed payloads:

```typescript
// Example: Track and log specific tool usage
async function preToolUse(payload: PreToolUsePayload): Promise<HookResponse> {
  // Full type safety - TypeScript knows exactly what's in the payload!
  if (payload.tool_name === 'Write' && payload.tool_input) {
    const { file_path, content } = payload.tool_input as WriteToolInput
    console.log(`Claude is writing to: ${file_path}`)
    
    // Add your custom logic here
    // Maybe notify a webhook, update a dashboard, etc.
  }
  
  return { action: 'continue' }
}

// Example: React to completed tasks
async function postToolUse(payload: PostToolUsePayload): Promise<void> {
  if (payload.tool_name === 'Bash' && payload.success) {
    // TypeScript gives you auto-completion for all payload properties!
    console.log(`Command completed: ${payload.tool_input.command}`)
  }
}
```

The beauty is that you're writing regular TypeScript - use any npm packages, async/await, or patterns you're familiar with!

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
