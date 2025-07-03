# Claude Hooks Examples

This directory contains examples and guides for using and customizing claude-hooks.

## Contents

- [custom-patterns.md](./custom-patterns.md) - Examples of custom security patterns and advanced hook configurations

## Quick Example

After installing hooks with `npx claude-hooks`, here's a simple customization:

```typescript
// .claude/hooks/index.ts

// Add your company-specific patterns
const COMPANY_PATTERNS = [
  /internal\.mycompany\.com/,  // Protect internal domains
  /SECRET_KEY/,                 // Block literal secret keys
  /DROP\s+TABLE\s+users/i,      // Protect critical tables
];

// Add to your preToolUse function
for (const pattern of COMPANY_PATTERNS) {
  if (pattern.test(command)) {
    return {
      action: 'block',
      stopReason: `Company policy violation: ${pattern}`
    };
  }
}
```

## Testing Your Hooks

You can test your hooks manually:

```bash
# Create a test script
cat > test-hook.js << 'EOF'
const hook = {
  hook_type: 'PreToolUse',
  session_id: 'test-123',
  tool_name: 'Bash',
  tool_input: { command: 'rm -rf /' }
};

console.log(JSON.stringify(hook));
EOF

# Test your hook
echo '{"hook_type":"PreToolUse","session_id":"test","tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | bun .claude/hooks/index.ts
```

## Contributing Examples

If you have interesting hook patterns or use cases, please contribute! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.