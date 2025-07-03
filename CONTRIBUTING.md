# Contributing to claude-hooks

Thank you for your interest in contributing to claude-hooks! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Documentation](#documentation)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/claude-hooks.git`
3. Add upstream remote: `git remote add upstream https://github.com/anthropics/claude-hooks.git`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Bun runtime (for testing generated hooks)

### Installation

```bash
# Clone the repository
git clone https://github.com/anthropics/claude-hooks.git
cd claude-hooks

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Development Workflow

```bash
# Start development (watch mode)
npm run dev

# Run tests during development
npm test -- --watch

# Check code style
npm run lint

# Run type checking
npm run build
```

## Making Changes

### Branch Naming

- Features: `feature/description`
- Bug fixes: `fix/description`
- Documentation: `docs/description`
- Refactoring: `refactor/description`

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```bash
feat(init): add support for Ruby projects
fix(security): prevent false positives in secret detection
docs(readme): update installation instructions
test(init): add tests for force flag behavior
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:smoke

# Run specific test file
npm test test/commands/init.test.ts

# Run tests matching pattern
npm test -- --grep "security patterns"
```

### Writing Tests

1. **Unit Tests**: Test individual functions and components
   - Location: `test/unit/`, `test/commands/`
   - Use mocks for external dependencies
   - Focus on edge cases

2. **Integration Tests**: Test complete workflows
   - Location: `test/integration/`
   - Test actual CLI execution
   - Verify file system operations

3. **Smoke Tests**: Verify generated output
   - Location: `test/smoke/`
   - Check generated file syntax
   - Validate security patterns

Example test:
```typescript
describe('init command', () => {
  it('should generate hooks with security patterns', async () => {
    const result = await runCommand(['init', '--yes'])
    expect(result.stdout).to.include('setup complete')
    
    const indexContent = await fs.readFile('.claude/hooks/index.ts', 'utf8')
    expect(indexContent).to.include('DANGEROUS_FILE_OPS')
  })
})
```

### Test Coverage

Maintain test coverage above:
- Branches: 80%
- Lines: 85%
- Functions: 80%
- Statements: 85%

## Submitting Changes

### Pull Request Process

1. Update your branch with latest upstream changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Ensure all tests pass:
   ```bash
   npm test
   npm run lint
   ```

3. Update documentation if needed

4. Submit pull request with:
   - Clear title and description
   - Reference to related issues
   - Screenshots for UI changes
   - Test results

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] All tests pass
- [ ] Added new tests
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log statements
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer interfaces over types for objects
- Use explicit return types
- Avoid `any` type

### Style Guide

- 2 spaces for indentation
- Single quotes for strings
- No semicolons (prettier handles this)
- Max line length: 100 characters

### File Organization

```
src/
├── commands/      # CLI command implementations
├── hooks/         # Hook-related utilities
├── templates/     # Template generators
└── utils/         # Shared utilities
```

## Documentation

### Code Documentation

- Add JSDoc comments for public APIs
- Include examples in comments
- Document complex algorithms

Example:
```typescript
/**
 * Generates a customized hook file based on user selections
 * @param hooks - Selected hook types
 * @param security - Security feature configuration
 * @returns Generated TypeScript code
 * @example
 * const code = generateHookFile(
 *   { preToolUse: true },
 *   { blockDangerousFileOps: true }
 * )
 */
export function generateHookFile(
  hooks: HookSelection,
  security: SecurityFeatures
): string {
  // Implementation
}
```

### README Updates

Update README.md when:
- Adding new features
- Changing CLI options
- Updating requirements

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Contact maintainers for security issues

Thank you for contributing to claude-hooks! 🚀