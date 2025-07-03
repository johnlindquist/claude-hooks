# Custom Hook Patterns Examples

This directory contains examples of how to customize your Claude hooks after generation.

## Adding Custom Security Patterns

After running `npx claude-hooks`, you can edit `.claude/hooks/index.ts` to add your own patterns:

### Example: Database Protection

```typescript
// Add to your existing patterns
const DATABASE_PROTECTION = [
  /DROP\s+(DATABASE|TABLE|INDEX)/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM\s+\w+\s*(?:$|WHERE\s+1\s*=\s*1)/i, // DELETE without WHERE or WHERE 1=1
];

// In your preToolUse function
if (payload.tool_name === 'Bash') {
  const command = bashInput.command;
  
  // Check for dangerous database operations
  for (const pattern of DATABASE_PROTECTION) {
    if (pattern.test(command)) {
      return {
        action: 'block',
        stopReason: `Dangerous database operation detected: ${pattern}`
      };
    }
  }
}
```

### Example: API Endpoint Protection

```typescript
// Protect specific API endpoints
const PROTECTED_ENDPOINTS = [
  'api.company.internal',
  'admin.company.com',
  'staging.company.com'
];

// In preToolUse
if (command.includes('curl') || command.includes('wget')) {
  for (const endpoint of PROTECTED_ENDPOINTS) {
    if (command.includes(endpoint)) {
      log('⚠️  Access to protected endpoint requested:', endpoint);
      return {
        action: 'block',
        stopReason: `Access to protected endpoint ${endpoint} is restricted`
      };
    }
  }
}
```

### Example: Custom Logging

```typescript
// Enhanced logging for specific operations
export async function postToolUse(payload: PostToolUsePayload): Promise<void> {
  await saveSessionData('PostToolUse', payload);
  
  // Custom logging for git operations
  if (payload.tool_name === 'Bash' && payload.tool_input.command?.includes('git')) {
    log('🔄 Git operation:', payload.tool_input.command);
    
    // Log commit messages
    if (payload.tool_input.command.includes('git commit')) {
      const messageMatch = payload.tool_input.command.match(/-m\s+["']([^"']+)["']/);
      if (messageMatch) {
        log('📝 Commit message:', messageMatch[1]);
      }
    }
  }
  
  // Alert on test failures
  if (payload.tool_error || payload.tool_result?.includes('FAILED')) {
    log('❌ Tool execution failed:', payload.tool_name);
    // Could send to external monitoring here
  }
}
```

### Example: Environment-Specific Rules

```typescript
// Different rules for different environments
const ENV = process.env.NODE_ENV || 'development';

const PRODUCTION_BLOCKS = [
  /npm\s+install/,  // No installing in production
  /yarn\s+add/,
  /pip\s+install/,
];

const DEVELOPMENT_WARNINGS = [
  /console\.log/,
  /debugger/,
  /TODO:/,
];

export async function preToolUse(payload: PreToolUsePayload): Promise<HookResponse> {
  if (ENV === 'production' && payload.tool_name === 'Bash') {
    for (const pattern of PRODUCTION_BLOCKS) {
      if (pattern.test(payload.tool_input.command)) {
        return {
          action: 'block',
          stopReason: 'Package installation not allowed in production'
        };
      }
    }
  }
  
  if (ENV === 'development' && payload.tool_name === 'Edit') {
    // Just log warnings in development
    for (const pattern of DEVELOPMENT_WARNINGS) {
      if (pattern.test(payload.tool_input.new_string || '')) {
        log('⚠️  Development pattern detected:', pattern);
      }
    }
  }
  
  return { action: 'continue' };
}
```

## Testing Your Custom Patterns

Create a test file to verify your patterns work correctly:

```typescript
// test-patterns.ts
import { preToolUse } from './.claude/hooks/index';

const testCases = [
  {
    payload: {
      hook_type: 'PreToolUse',
      session_id: 'test',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' }
    },
    expected: 'block'
  },
  {
    payload: {
      hook_type: 'PreToolUse',
      session_id: 'test',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' }
    },
    expected: 'continue'
  }
];

async function testPatterns() {
  for (const test of testCases) {
    const result = await preToolUse(test.payload as any);
    console.log(`Test: ${test.payload.tool_input.command}`);
    console.log(`Expected: ${test.expected}, Got: ${result.action}`);
    console.log(result.action === test.expected ? '✅ PASS' : '❌ FAIL');
    console.log('---');
  }
}

testPatterns();
```

Run with: `bun test-patterns.ts`

## Best Practices

1. **Be Specific**: Use precise regex patterns to avoid false positives
2. **Log Before Blocking**: Help users understand why commands are blocked
3. **Test Thoroughly**: Test your patterns with both valid and invalid commands
4. **Document Patterns**: Add comments explaining what each pattern protects against
5. **Consider Context**: Some commands may be safe in one context but dangerous in another

## Need Help?

- Check the [main documentation](../README.md)
- Open an [issue](https://github.com/anthropics/claude-hooks/issues)
- See more examples in the [test files](../test/)