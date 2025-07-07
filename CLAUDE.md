# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Building and Development
- `bun run build` - Compile TypeScript to JavaScript
- `bun run lint` - Run Biome linter
- `bun run lint:fix` - Run Biome linter with auto-fix
- `bun run format` - Format code with Biome

### Testing
- `bun test` - Run all tests
- `bun run test:unit` - Run unit tests only
- `bun run test:integration` - Run integration tests
- `bun run test:smoke` - Run smoke tests
- `bun run test:coverage` - Run tests with coverage report

### Clean Up
- `bun run clean` - Remove all build artifacts and test outputs
- `bun run clean:test` - Remove only test output directories

## Architecture

This is an oclif-based CLI tool written in TypeScript that generates a hook system for Claude Code.

### Key Components

1. **Command Structure**: Commands live in `src/commands/`. Currently, there's only the main `init` command that sets up the hook system.

2. **Template System**: Hook templates are stored in `templates/` and copied to the user's `.claude/` directory when initialized.

3. **Hook Types**: The system supports four hook types:
   - `PreToolUse` - Intercept tool usage before execution
   - `PostToolUse` - React to tool execution results
   - `Notification` - Handle Claude notifications
   - `Stop` - Handle session stop events

4. **Generated Structure**: Running the CLI creates:
   ```
   .claude/
   ├── settings.json      # Hook configuration
   └── hooks/
       ├── index.ts       # Main hook handlers (user edits this)
       ├── lib.ts         # Type definitions and utilities
       └── session.ts     # Session tracking utilities
   ```

### Testing Strategy

- **Unit Tests**: Test individual commands and components
- **Integration Tests**: Test the full CLI behavior
- **Smoke Tests**: Validate generated files work correctly
- **CI/CD**: Tests run on Ubuntu, Windows, and macOS with Node 18 & 20

### Development Workflow

1. Work on feature branches, never directly on main
2. Use conventional commits (e.g., `feat:`, `fix:`, `chore:`)
3. Create pull requests to merge into main
4. Semantic Release handles versioning and npm publishing automatically

### Important Notes

- Hooks are executed using Bun runtime (required dependency)
- The project uses ESM modules (`"type": "module"`)
- TypeScript strict mode is enabled
- Session logs are written to the system temp directory