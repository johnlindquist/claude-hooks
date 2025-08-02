# Hook Integration Tests

This directory contains comprehensive integration tests for the Claude Hooks system to ensure proper hook isolation and prevent incorrect hook firing.

## Test Coverage

### Hook Firing Tests (`hook-firing.test.ts`)
- **Hook Isolation**: Ensures only the specified hook handler executes
- **Data Isolation**: Verifies hooks don't share data between invocations
- **Response Structure**: Validates correct response formats for each hook type
- **Session Data**: Tests independent session data storage

### Edge Cases Tests (`hook-edge-cases.test.ts`)
- **Duplicate Prevention**: Ensures pre and post hooks don't both fire for the same event
- **Race Conditions**: Tests rapid sequential hook calls
- **Process Arguments**: Validates argv-based hook type determination
- **Error Recovery**: Tests graceful error handling

### Transcript-Based Tests (`transcript-based-hooks.test.ts`)
- **Transcript Analysis**: Tests accessing transcript data without triggering other hooks
- **Complex Interactions**: Validates nested tool analysis doesn't cause recursion
- **State Management**: Tests shared state isolation between hooks

## Key Findings

The tests confirm that the hook system correctly:
1. **Uses argv[2] to determine which hook to execute** - The hook type is passed as a command-line argument, not through the payload
2. **Each hook invocation is a separate process** - No shared state between different hook calls
3. **Hook handlers are isolated** - Only the specified handler runs based on argv
4. **Payload hook_event_name is for validation only** - The actual hook execution is determined by argv

## Running Tests

```bash
# Run all hook integration tests
bun test test/integration/hook-*.test.ts

# Run specific test file
bun test test/integration/hook-firing.test.ts
```

## Implementation Details

The hook system works as follows:
1. Claude Code executes: `bun .claude/hooks/index.ts [HookType]`
2. The `runHook()` function reads `process.argv[2]` to determine the hook type
3. Only the corresponding handler is executed
4. Each execution is completely isolated in its own process

This architecture ensures that:
- Pre-tool-use hooks cannot accidentally trigger post-tool-use logic
- Multiple hooks can run concurrently without interference
- Hook state is not shared between invocations