# PreToolUse Hook Examples from GitHub

## Overview
The PreToolUse hook is a Claude Code feature that allows you to intercept and validate tool usage before execution. These examples demonstrate various implementation approaches for security validation, command filtering, and custom logic before tools are executed by Claude.

## User's Code
Since no specific code was provided, these examples showcase general PreToolUse hook implementations.

## GitHub Examples

### Example 1: conneroisu/dotfiles - Comprehensive Security Validation
**Repository**: conneroisu/dotfiles
**Stars**: Not visible in data
**Language**: TypeScript
**Context**: A dotfiles repository with a sophisticated Claude Code hook system featuring security validation and performance monitoring

```typescript
/**
 * Pre-Tool Use Hook
 * Validates tool usage before execution with security checks
 * Blocks access to .env files and logs potentially dangerous commands
 */

import type { ToolUseHookInput, HookResult } from '../types.ts';
import { Logger, InputReader, SecurityValidator, createHookResult, handleError } from '../utils.ts';

export class PreToolUseHook {
  static async execute(): Promise<HookResult> {
    try {
      const input = await InputReader.readStdinJson<ToolUseHookInput>();

      Logger.info('Processing pre-tool-use hook', {
        tool_name: input.tool_name,
        has_tool_input: !!input.tool_input,
      });

      // Security validation for .env file access
      const envValidation = SecurityValidator.validateEnvFileAccess(
        input.tool_name,
        input.tool_input
      );
      if (!envValidation.allowed) {
        Logger.error('Security violation: .env file access blocked', {
          tool_name: input.tool_name,
          tool_input: input.tool_input,
          reason: envValidation.reason,
        });

        console.error(envValidation.reason);
        Logger.appendToLog('pre_tool_use.json', {
          ...input,
          blocked: true,
          reason: envValidation.reason,
        });

        return createHookResult(false, envValidation.reason, true);
      }

      // Security validation for dangerous commands
      const commandValidation = SecurityValidator.validateDangerousCommands(
        input.tool_name,
        input.tool_input
      );
      if (!commandValidation.allowed) {
        Logger.error('Security violation: dangerous command blocked', {
          tool_name: input.tool_name,
          tool_input: input.tool_input,
          reason: commandValidation.reason,
        });

        console.error(commandValidation.reason);
        Logger.appendToLog('pre_tool_use.json', {
          ...input,
          blocked: true,
          reason: commandValidation.reason,
        });

        return createHookResult(false, commandValidation.reason, true);
      }

      // Log approved tool usage
      Logger.appendToLog('pre_tool_use.json', {
        ...input,
        approved: true,
      });

      Logger.debug('Tool usage approved', {
        tool_name: input.tool_name,
      });

      return createHookResult(true, 'Tool usage validated successfully');
    } catch (error) {
      return handleError(error, 'pre-tool-use hook');
    }
  }
}

if (import.meta.main) {
  const result = await PreToolUseHook.execute();
  process.exit(result.exit_code);
}
```

**How it compares**: 
- Implements comprehensive security validation for both environment files and dangerous commands
- Uses a class-based approach with static methods for better organization
- Includes extensive logging for security events and debugging
- Returns structured HookResult objects with success/failure status and exit codes
- Handles errors gracefully with a dedicated error handler

### Example 2: yifanzz/claude-code-boost - Auto-Approval Installation System
**Repository**: yifanzz/claude-code-boost
**Stars**: Not visible in data
**Language**: TypeScript
**Context**: A CLI tool that installs PreToolUse hooks for intelligent auto-approval of safe Claude Code operations

```typescript
interface ClaudeSettings {
  hooks?: {
    PreToolUse?:
      | string
      | Array<{
          matcher: string;
          hooks: Array<{
            type: string;
            command: string;
          }>;
        }>;
  };
  [key: string]: unknown;
}

function addHookToSettings(
  settings: ClaudeSettings,
  hookCommand: string
): void {
  // Validate the hook command before adding
  if (!validateHookCommand(hookCommand)) {
    throw new Error(`Invalid hook command: ${hookCommand}`);
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  settings.hooks.PreToolUse = [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: hookCommand,
        },
      ],
    },
  ];
}

function checkForExistingHook(
  settings: ClaudeSettings,
  hookCommand: string
): boolean {
  const currentHook = settings.hooks?.PreToolUse;

  if (typeof currentHook === 'string') {
    return currentHook === hookCommand;
  } else if (Array.isArray(currentHook)) {
    return currentHook.some((matcher) =>
      matcher.hooks.some((hook) => hook.command === hookCommand)
    );
  }

  return false;
}
```

**How it compares**: 
- Focuses on hook configuration and installation rather than execution
- Supports both string and array-based hook configurations
- Implements validation for hook commands before installation
- Provides conflict detection for existing hooks
- Uses a matcher pattern to apply hooks to all tools ('*')

### Example 3: Hook Router Pattern
**Repository**: conneroisu/dotfiles (index.ts)
**Stars**: Not visible in data
**Language**: TypeScript
**Context**: Main entry point showing how PreToolUse hooks are integrated into a larger hook system

```typescript
export class HookRouter {
  private static readonly HOOK_MAP = {
    notification: NotificationHook,
    pre_tool_use: PreToolUseHook,
    post_tool_use: PostToolUseHook,
    user_prompt_submit: UserPromptSubmitHook,
    stop: StopHook,
    subagent_stop: SubagentStopHook,
  } as const;

  static async route(hookType: HookType): Promise<HookResult> {
    const HookClass = this.HOOK_MAP[hookType];

    if (!HookClass) {
      const message = `Unknown hook type: ${hookType}`;
      Logger.error(message);
      return {
        success: false,
        message,
        blocked: false,
        exit_code: 1,
      };
    }

    const startTime = PerformanceMonitor.startTiming(hookType);
    Logger.info(`Executing ${hookType} hook`);

    try {
      const result = await HookClass.execute();
      const metrics = PerformanceMonitor.endTiming(
        hookType,
        startTime,
        result.success,
        result.message
      );

      Logger.info(`Hook ${hookType} completed`, {
        success: result.success,
        blocked: result.blocked,
        duration_ms: metrics.duration,
        memory_mb: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const metrics = PerformanceMonitor.endTiming(hookType, startTime, false, errorMessage);
      const message = `Hook execution failed: ${errorMessage}`;

      Logger.error(message, {
        hookType,
        error: errorMessage,
        duration_ms: metrics.duration,
        memory_mb: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
      });

      return {
        success: false,
        message,
        blocked: false,
        exit_code: 1,
      };
    }
  }
}
```

**How it compares**: 
- Demonstrates a centralized routing pattern for all hook types
- Includes performance monitoring for hook execution
- Provides consistent error handling across all hook types
- Uses a map-based approach for hook class lookup
- Measures memory usage and execution time for each hook

### Example 4: Type Definitions
**Repository**: sushichan044/dotfiles
**Stars**: Not visible in data
**Language**: TypeScript
**Context**: Type definitions showing the available hook events in Claude Code

```typescript
/**
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#hook-events}
 */
export type HookEvents =
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "UserPromptSubmit"
  | "Stop"
  | "SubagentStop"
  | "PreCompact";
```

**How it compares**: 
- Shows the complete list of available hook events
- Uses string literal types for type safety
- References official Anthropic documentation
- Includes the newer PreCompact hook type

## Summary

### Common patterns observed:
1. **Input Validation**: All implementations read and validate input from stdin
2. **Security Focus**: PreToolUse hooks are primarily used for security validation
3. **Structured Response**: Hooks return standardized result objects with success/failure status
4. **Error Handling**: Comprehensive error handling with logging
5. **Configuration**: Hooks can be configured as strings or arrays with matchers

### Best practices identified:
1. **Validate Early**: Check tool inputs before allowing execution
2. **Log Everything**: Keep detailed logs of blocked and approved actions
3. **Fail Gracefully**: Return proper error codes and messages
4. **Use TypeScript**: Strong typing helps prevent errors in hook implementations
5. **Modular Design**: Separate hook logic into dedicated classes or modules

### Recommendations for implementation:
1. Start with basic input validation and gradually add security rules
2. Use a SecurityValidator utility class to centralize validation logic
3. Implement comprehensive logging for debugging and audit trails
4. Consider performance monitoring for production environments
5. Support both simple string commands and complex array configurations
6. Always validate hook commands before installation to prevent injection attacks