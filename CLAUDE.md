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

### Known Issues and Solutions

#### TypeScript Warning in Production
**Problem**: When users run `npx claude-hooks`, they may see:
```
Warning: Could not find typescript. Please ensure that typescript is a devDependency.
```

**Root Cause**: Oclif checks for TypeScript during module import, not during execution. It searches for tsconfig.json starting from the current working directory and moving up the directory tree.

**Solution**: Set `NODE_ENV=production` in bin/run.js BEFORE importing @oclif/core:
```javascript
// Set production mode before importing to prevent TypeScript detection
process.env.NODE_ENV = 'production'

import {execute} from '@oclif/core'
```

**Why other approaches don't work**:
- Setting `development: false` in execute() is too late - the check happens during import
- Setting `OCLIF_TS_NODE=0` doesn't prevent the initial TypeScript check
- Intercepting stderr is a hack that masks the real issue

## Best Practices & Lessons Learned

### Always Test with the Actual Published Package
Before declaring a fix complete, always test with the actual npm package:
```bash
npx package-name@latest
```
Testing only locally can miss issues that appear in the published version.

### Updating Help Documentation
When improving CLI help:
1. Update package.json description to match README
2. Update command descriptions in the static description field
3. Run `npx oclif manifest` after changes to update the manifest
4. Consider removing irrelevant plugins (like `@oclif/plugin-plugins` if not needed)

### Git Workflow
1. Always verify fixes work before committing
2. Use `--no-verify` flag sparingly when git hooks have issues
3. Check PR status with `gh pr checks <number>`
4. Enable automerge with `gh pr merge <number> --auto --squash`

### Debugging Oclif Issues
1. Oclif searches for configuration starting from the current working directory
2. Module loading happens before execute() is called
3. Use `NODE_ENV=production` to affect behavior during import time
4. The `development` flag in execute() only affects runtime behavior

### Testing Strategy
- Test from different directories to catch path-related issues
- Test with a tsconfig.json in the current directory
- Ensure all existing tests pass before pushing
- Clean up test directories after testing

### Common Pitfalls to Avoid
1. Don't assume environment variables set after import will affect module loading
2. Don't rely on intercepting stdout/stderr as a permanent solution
3. Always test the exact scenario users will experience
4. Remember that published packages don't include devDependencies