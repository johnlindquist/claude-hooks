#!/usr/bin/env bun

/**
 * Claude Code Hook Payload Schemas
 *
 * This file provides TypeScript interfaces for all Claude Code hook payloads
 * based on the official documentation. Use these for type-safe hook development.
 */

// ============================================================================
// Input Payload Schemas
// ============================================================================

/** Common fields present in all hook payloads */
interface BasePayload {
  session_id: string
  transcript_path: string
}

/** PreToolUse hook input payload */
export interface PreToolUseInput extends BasePayload {
  tool_name: string
  tool_input: Record<string, any>
}

/** PostToolUse hook input payload */
export interface PostToolUseInput extends BasePayload {
  tool_name: string
  tool_input: Record<string, any>
  tool_response: Record<string, any> & {
    success?: boolean
  }
}

/** Notification hook input payload */
export interface NotificationInput extends BasePayload {
  message: string
  title: string
}

/** Stop hook input payload */
export interface StopInput extends BasePayload {
  stop_hook_active: boolean
}

/** SubagentStop hook input payload */
export interface SubagentStopInput extends BasePayload {
  stop_hook_active: boolean
}

/** Union type for all possible hook input payloads */
export type HookInput = PreToolUseInput | PostToolUseInput | NotificationInput | StopInput | SubagentStopInput

// ============================================================================
// Output Response Schemas
// ============================================================================

/** Common fields available in all hook responses */
interface BaseResponse {
  /** Whether Claude should continue after hook execution (default: true) */
  continue?: boolean
  /** Message shown to user when continue is false */
  stopReason?: string
  /** Hide stdout from transcript mode (default: false) */
  suppressOutput?: boolean
}

/** PreToolUse hook response */
export interface PreToolUseResponse extends BaseResponse {
  /** Decision about tool execution */
  decision?: 'approve' | 'block'
  /** Explanation for decision (shown to Claude if blocking, to user if approving) */
  reason?: string
}

/** PostToolUse hook response */
export interface PostToolUseResponse extends BaseResponse {
  /** Decision to provide feedback to Claude */
  decision?: 'block'
  /** Feedback shown to Claude when decision is 'block' */
  reason?: string
}

/** Stop/SubagentStop hook response */
export interface StopResponse extends BaseResponse {
  /** Decision about whether Claude can stop */
  decision?: 'block'
  /** REQUIRED when decision is 'block' - tells Claude how to proceed */
  reason?: string
}

/** Notification hook response (uses base response only) */
export type NotificationResponse = BaseResponse

/** SubagentStop response (same as Stop) */
export type SubagentStopResponse = StopResponse

// ============================================================================
// Tool-Specific Input Schemas
// ============================================================================

/** Common tool input types */
export namespace ToolInputs {
  export interface Write {
    file_path: string
    content: string
  }

  export interface Edit {
    file_path: string
    old_string: string
    new_string: string
    replace_all?: boolean
  }

  export interface Bash {
    command: string
    timeout?: number
    description?: string
  }

  export interface Read {
    file_path: string
    limit?: number
    offset?: number
  }

  export interface Glob {
    pattern: string
    path?: string
  }

  export interface Grep {
    pattern: string
    path?: string
    include?: string
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/** Type guard to check if input is PreToolUse */
export function isPreToolUseInput(input: HookInput): input is PreToolUseInput {
  return 'tool_name' in input && !('tool_response' in input)
}

/** Type guard to check if input is PostToolUse */
export function isPostToolUseInput(input: HookInput): input is PostToolUseInput {
  return 'tool_name' in input && 'tool_response' in input
}

/** Type guard to check if input is Notification */
export function isNotificationInput(input: HookInput): input is NotificationInput {
  return 'message' in input && 'title' in input
}

/** Type guard to check if input is Stop or SubagentStop */
export function isStopInput(input: HookInput): input is StopInput | SubagentStopInput {
  return 'stop_hook_active' in input
}

// ============================================================================
// Validation Functions
// ============================================================================

/** Validates that a response has required fields when blocking */
export function validateStopResponse(response: StopResponse): string | null {
  if (response.decision === 'block' && !response.reason) {
    return 'reason is required when decision is "block"'
  }
  return null
}

/** Validates hook response based on hook type */
export function validateHookResponse(
  hookType: 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SubagentStop' | 'Notification',
  response: any,
): string | null {
  // Check for valid decision values based on hook type
  if ('decision' in response) {
    switch (hookType) {
      case 'PreToolUse':
        if (response.decision && !['approve', 'block'].includes(response.decision)) {
          return `Invalid decision for PreToolUse: ${response.decision}`
        }
        break
      case 'PostToolUse':
      case 'Stop':
      case 'SubagentStop':
        if (response.decision && response.decision !== 'block') {
          return `Invalid decision for ${hookType}: ${response.decision}`
        }
        if (hookType === 'Stop' || hookType === 'SubagentStop') {
          const error = validateStopResponse(response)
          if (error) return error
        }
        break
      case 'Notification':
        if (response.decision) {
          return 'Notification hooks should not have a decision field'
        }
        break
    }
  }

  return null
}

// ============================================================================
// Example Usage
// ============================================================================

/** Example minimal payloads for testing */
export const examplePayloads = {
  preToolUse: {
    session_id: 'abc123',
    transcript_path: '/path/to/transcript.jsonl',
    tool_name: 'Write',
    tool_input: {
      file_path: '/path/to/file.txt',
      content: 'Hello, world!',
    },
  } as PreToolUseInput,

  postToolUse: {
    session_id: 'abc123',
    transcript_path: '/path/to/transcript.jsonl',
    tool_name: 'Write',
    tool_input: {
      file_path: '/path/to/file.txt',
      content: 'Hello, world!',
    },
    tool_response: {
      success: true,
      filePath: '/path/to/file.txt',
    },
  } as PostToolUseInput,

  notification: {
    session_id: 'abc123',
    transcript_path: '/path/to/transcript.jsonl',
    message: 'Task completed successfully',
    title: 'Claude Code',
  } as NotificationInput,

  stop: {
    session_id: 'abc123',
    transcript_path: '/path/to/transcript.jsonl',
    stop_hook_active: false,
  } as StopInput,
}

/** Example responses */
export const exampleResponses = {
  // Approve a tool call
  approveToolCall: {
    decision: 'approve',
    reason: 'Approved by security policy',
  } as PreToolUseResponse,

  // Block a dangerous command
  blockDangerousCommand: {
    decision: 'block',
    reason: 'Command contains dangerous operation: rm -rf /',
  } as PreToolUseResponse,

  // Continue with default behavior
  continueDefault: {} as BaseResponse,

  // Stop all processing
  stopProcessing: {
    continue: false,
    stopReason: 'Critical error detected',
  } as BaseResponse,

  // Force Claude to continue (Stop hook)
  forceContinue: {
    decision: 'block',
    reason: 'Please also update the documentation for this change',
  } as StopResponse,
}
