# Claude Hooks Tests

This directory contains comprehensive tests for the claude-hooks CLI package.

## Test Structure

```
test/
├── commands/      # Unit tests for CLI commands
├── unit/          # Unit tests for individual functions
├── integration/   # Integration tests for full workflows
├── smoke/         # Smoke tests for generated files
└── helpers/       # Test utilities and helpers
```

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only smoke tests
npm run test:smoke

# Run with coverage
npm run test -- --coverage
```

## Test Categories

### Unit Tests (`test/unit/`, `test/commands/`)
- Test individual functions and components
- Mock external dependencies
- Fast execution
- Test edge cases and error handling

### Integration Tests (`test/integration/`)
- Test complete CLI workflows
- Execute actual commands
- Verify file system operations
- Test command combinations

### Smoke Tests (`test/smoke/`)
- Verify generated file structure
- Check file contents and syntax
- Ensure generated hooks are valid
- Test security patterns

## Writing Tests

### Unit Test Example

```typescript
import {expect} from 'chai'
import {generateIndexFile} from '../src/generator'

describe('generateIndexFile', () => {
  it('should include preToolUse when selected', () => {
    const result = generateIndexFile({preToolUse: true})
    expect(result).to.include('const preToolUse: PreToolUseHandler')
  })
})
```

### Integration Test Example

```typescript
import {execSync} from 'child_process'

describe('CLI Integration', () => {
  it('should complete installation', () => {
    const output = execSync('node bin/run.js init --yes')
    expect(output).to.include('setup complete')
  })
})
```

### Smoke Test Example

```typescript
describe('Generated Files', () => {
  it('should create valid TypeScript', async () => {
    const content = await fs.readFile('.claude/hooks/index.ts')
    expect(() => ts.compile(content)).not.to.throw()
  })
})
```

## Test Helpers

The `test/helpers` directory provides utilities:

- `createTestDirectory()`: Creates isolated test directories
- `cleanupTestDirectory()`: Cleans up after tests
- `verifyHooksStructure()`: Checks generated file structure
- `expectHooksContent()`: Validates hook file contents

## CI/CD

Tests run automatically on:
- Every push to main branch
- All pull requests
- Multiple OS (Ubuntu, Windows, macOS)
- Multiple Node.js versions (18, 20)

See `.github/workflows/test.yml` for configuration.

## Debugging Tests

```bash
# Run tests with full output
npm test -- --reporter spec

# Run specific test file
npm test test/commands/init.test.ts

# Run tests matching pattern
npm test -- --grep "force flag"

# Debug with VS Code
# Use the launch configuration in .vscode/launch.json
```