#!/usr/bin/env bun

import * as fs from 'fs'
import * as readline from 'readline'

// Transcript message types
export interface TranscriptSummary {
  type: 'summary'
  summary: string
  leafUuid: string
}

export interface TranscriptUserMessage {
  parentUuid: string | null
  isSidechain: boolean
  userType: 'external'
  cwd: string
  sessionId: string
  version: string
  gitBranch?: string
  type: 'user'
  message: {
    role: 'user'
    content:
      | string
      | Array<{
          tool_use_id?: string
          type: 'tool_result' | 'text'
          content?: string
          is_error?: boolean
        }>
  }
  uuid: string
  timestamp: string
  toolUseResult?: {
    stdout: string
    stderr: string
    interrupted: boolean
    isImage: boolean
  }
}

export interface TranscriptAssistantMessage {
  parentUuid: string
  isSidechain: boolean
  userType: 'external'
  cwd: string
  sessionId: string
  version: string
  gitBranch?: string
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    model: string
    content: Array<{
      type: 'text' | 'tool_use'
      text?: string
      id?: string
      name?: string
      input?: Record<string, unknown>
    }>
    stop_reason: string | null
    stop_sequence: string | null
    usage: {
      input_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
      output_tokens: number
      service_tier: string
    }
  }
  requestId: string
  type: 'assistant'
  uuid: string
  timestamp: string
}

export type TranscriptMessage = TranscriptSummary | TranscriptUserMessage | TranscriptAssistantMessage

// Helper function to load the initial user message from a transcript
export async function getInitialMessage(transcriptPath: string): Promise<string | null> {
  try {
    const fileStream = fs.createReadStream(transcriptPath)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      if (!line.trim()) continue

      try {
        const message = JSON.parse(line) as TranscriptMessage

        // Skip summary messages
        if (message.type === 'summary') continue

        // Find the first user message
        if (message.type === 'user' && message.message.role === 'user') {
          // Handle string content
          if (typeof message.message.content === 'string') {
            return message.message.content
          }

          // Handle array content (tool results)
          if (Array.isArray(message.message.content)) {
            const textContent = message.message.content
              .filter((item) => item.type === 'text' && item.content)
              .map((item) => item.content)
              .join('\n')

            if (textContent) return textContent
          }
        }
      } catch (_e) {}
    }

    return null
  } catch (error) {
    console.error('Error reading transcript:', error)
    return null
  }
}

// Additional helper functions for transcript operations
export async function getAllMessages(transcriptPath: string): Promise<TranscriptMessage[]> {
  const messages: TranscriptMessage[] = []

  try {
    const fileStream = fs.createReadStream(transcriptPath)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      if (!line.trim()) continue

      try {
        const message = JSON.parse(line) as TranscriptMessage
        messages.push(message)
      } catch (_e) {}
    }
  } catch (error) {
    console.error('Error reading transcript:', error)
  }

  return messages
}

export async function getConversationHistory(
  transcriptPath: string,
): Promise<Array<{role: 'user' | 'assistant'; content: string}>> {
  const messages = await getAllMessages(transcriptPath)
  const conversation: Array<{role: 'user' | 'assistant'; content: string}> = []

  for (const message of messages) {
    if (message.type === 'summary') continue

    if (message.type === 'user' && message.message.role === 'user') {
      let content = ''

      if (typeof message.message.content === 'string') {
        content = message.message.content
      } else if (Array.isArray(message.message.content)) {
        content = message.message.content
          .filter((item) => item.type === 'text' && item.content)
          .map((item) => item.content)
          .join('\n')
      }

      if (content) {
        conversation.push({role: 'user', content})
      }
    } else if (message.type === 'assistant') {
      const textContent = message.message.content
        .filter((item) => item.type === 'text' && item.text)
        .map((item) => item.text)
        .join('')

      if (textContent) {
        conversation.push({role: 'assistant', content: textContent})
      }
    }
  }

  return conversation
}

export async function getToolUsage(
  transcriptPath: string,
): Promise<Array<{tool: string; input: Record<string, unknown>; timestamp: string}>> {
  const messages = await getAllMessages(transcriptPath)
  const toolUsage: Array<{tool: string; input: Record<string, unknown>; timestamp: string}> = []

  for (const message of messages) {
    if (message.type === 'assistant') {
      const toolUses = message.message.content.filter((item) => item.type === 'tool_use')

      for (const toolUse of toolUses) {
        if (toolUse.name && toolUse.input) {
          toolUsage.push({
            tool: toolUse.name,
            input: toolUse.input,
            timestamp: message.timestamp,
          })
        }
      }
    }
  }

  return toolUsage
}

/**
 * Next steps for transcript operations:
 *
 * 1. Session Analysis Functions:
 *    - getSessionMetadata(): Extract session ID, version, CWD, git branch
 *    - getSessionDuration(): Calculate time between first and last message
 *    - getTokenUsage(): Sum all token usage from assistant messages
 *
 * 2. Tool Analysis Functions:
 *    - getToolErrors(): Extract tool results with is_error: true
 *    - getToolSuccessRate(): Calculate success/failure ratio
 *    - getMostUsedTools(): Rank tools by frequency
 *    - getToolSequences(): Identify common tool usage patterns
 *
 * 3. Content Analysis Functions:
 *    - searchTranscript(): Find messages containing specific keywords
 *    - getCodeBlocks(): Extract code from assistant responses
 *    - getFileOperations(): Track file reads/writes/edits
 *
 * 4. Advanced Analysis:
 *    - getConversationFlow(): Build a tree of message parent/child relationships
 *    - identifyProblems(): Find error patterns or failed attempts
 *    - getSummaries(): Extract all summary messages
 *
 * 5. Export Functions:
 *    - exportToMarkdown(): Convert conversation to readable markdown
 *    - exportToJSON(): Clean JSON export without internal fields
 *    - generateReport(): Create analytics report of the session
 *
 * Usage Example in Hooks:
 * ```typescript
 * export const userPromptSubmit: UserPromptSubmitHandler = async (payload) => {
 *   // Check if user is asking about a previous conversation
 *   if (payload.prompt.includes('previous') || payload.prompt.includes('last time')) {
 *     const history = await getConversationHistory(payload.transcript_path)
 *     const lastUserMessage = history.filter(m => m.role === 'user').pop()
 *
 *     return {
 *       decision: 'approve',
 *       additionalContext: `Last conversation context: ${lastUserMessage?.content}`,
 *     }
 *   }
 *
 *   return { decision: 'approve' }
 * }
 * ```
 */

// Input payload types based on official Claude Code schemas
export interface PreToolUsePayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'PreToolUse'
  tool_name: string
  tool_input: Record<string, unknown>
}

export interface PostToolUsePayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'PostToolUse'
  tool_name: string
  tool_input: Record<string, unknown>
  tool_response: Record<string, unknown> & {
    success?: boolean
  }
}

export interface NotificationPayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'Notification'
  message: string
  title?: string
}

export interface StopPayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'Stop'
  stop_hook_active: boolean
}

export interface SubagentStopPayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'SubagentStop'
  stop_hook_active: boolean
}

export interface UserPromptSubmitPayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'UserPromptSubmit'
  prompt: string
}

export interface PreCompactPayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'PreCompact'
  trigger: 'manual' | 'auto'
}

export interface SessionStartPayload {
  session_id: string
  transcript_path: string
  hook_event_name: 'SessionStart'
  source: string
}

export type HookPayload =
  | (PreToolUsePayload & {hook_type: 'PreToolUse'})
  | (PostToolUsePayload & {hook_type: 'PostToolUse'})
  | (NotificationPayload & {hook_type: 'Notification'})
  | (StopPayload & {hook_type: 'Stop'})
  | (SubagentStopPayload & {hook_type: 'SubagentStop'})
  | (UserPromptSubmitPayload & {hook_type: 'UserPromptSubmit'})
  | (PreCompactPayload & {hook_type: 'PreCompact'})
  | (SessionStartPayload & {hook_type: 'SessionStart'})

// Base response fields available to all hooks
export interface BaseHookResponse {
  continue?: boolean
  stopReason?: string
  suppressOutput?: boolean
}

// PreToolUse specific response
export interface PreToolUseResponse extends BaseHookResponse {
  permissionDecision?: 'allow' | 'deny' | 'ask'
  permissionDecisionReason?: string
}

// PostToolUse specific response
export interface PostToolUseResponse extends BaseHookResponse {
  decision?: 'block'
  reason?: string
}

// Stop/SubagentStop specific response
export interface StopResponse extends BaseHookResponse {
  decision?: 'block'
  reason?: string // Required when decision is 'block'
}

// UserPromptSubmit specific response
export interface UserPromptSubmitResponse extends BaseHookResponse {
  decision?: 'approve' | 'block'
  reason?: string
  contextFiles?: string[]
  updatedPrompt?: string
  hookSpecificOutput?: {
    hookEventName: 'UserPromptSubmit'
    additionalContext?: string
  }
}

// PreCompact specific response
export interface PreCompactResponse extends BaseHookResponse {
  decision?: 'approve' | 'block'
  reason?: string
}

// SessionStart specific response
export interface SessionStartResponse extends BaseHookResponse {
  decision?: 'approve' | 'block'
  reason?: string
  hookSpecificOutput?: {
    hookEventName: 'SessionStart'
    additionalContext?: string
  }
}

// Legacy simple response for backward compatibility
export interface HookResponse {
  action: 'continue' | 'block'
  stopReason?: string
}

export interface BashToolInput {
  command: string
  timeout?: number
  description?: string
}

// Hook handler types
export type PreToolUseHandler = (payload: PreToolUsePayload) => Promise<PreToolUseResponse> | PreToolUseResponse
export type PostToolUseHandler = (payload: PostToolUsePayload) => Promise<PostToolUseResponse> | PostToolUseResponse
export type NotificationHandler = (payload: NotificationPayload) => Promise<BaseHookResponse> | BaseHookResponse
export type StopHandler = (payload: StopPayload) => Promise<StopResponse> | StopResponse
export type SubagentStopHandler = (payload: SubagentStopPayload) => Promise<StopResponse> | StopResponse
export type UserPromptSubmitHandler = (
  payload: UserPromptSubmitPayload,
) => Promise<UserPromptSubmitResponse> | UserPromptSubmitResponse
export type PreCompactHandler = (payload: PreCompactPayload) => Promise<PreCompactResponse> | PreCompactResponse
export type SessionStartHandler = (payload: SessionStartPayload) => Promise<SessionStartResponse> | SessionStartResponse

export interface HookHandlers {
  preToolUse?: PreToolUseHandler
  postToolUse?: PostToolUseHandler
  notification?: NotificationHandler
  stop?: StopHandler
  subagentStop?: SubagentStopHandler
  userPromptSubmit?: UserPromptSubmitHandler
  preCompact?: PreCompactHandler
  sessionStart?: SessionStartHandler
}

// Logging utility
export function log(...args: unknown[]): void {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

// Main hook runner
export function runHook(handlers: HookHandlers): void {
  const hook_type = process.argv[2]

  process.stdin.on('data', async (data) => {
    try {
      const inputData = JSON.parse(data.toString())
      // Add hook_type for internal processing (not part of official input schema)
      const payload: HookPayload = {
        ...inputData,
        hook_type: hook_type as HookPayload['hook_type'],
      }

      switch (payload.hook_type) {
        case 'PreToolUse':
          if (handlers.preToolUse) {
            const response = await handlers.preToolUse(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          break

        case 'PostToolUse':
          if (handlers.postToolUse) {
            const response = await handlers.postToolUse(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          break

        case 'Notification':
          if (handlers.notification) {
            const response = await handlers.notification(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          break

        case 'Stop':
          if (handlers.stop) {
            const response = await handlers.stop(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          process.exit(0)
          return // Unreachable but satisfies linter

        case 'SubagentStop':
          if (handlers.subagentStop) {
            const response = await handlers.subagentStop(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          process.exit(0)
          return // Unreachable but satisfies linter

        case 'UserPromptSubmit':
          if (handlers.userPromptSubmit) {
            const response = await handlers.userPromptSubmit(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          break

        case 'PreCompact':
          if (handlers.preCompact) {
            const response = await handlers.preCompact(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          break

        case 'SessionStart':
          if (handlers.sessionStart) {
            const response = await handlers.sessionStart(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({}))
          }
          break

        default:
          console.log(JSON.stringify({}))
      }
    } catch (error) {
      console.error('Hook error:', error)
      console.log(JSON.stringify({action: 'continue'}))
    }
  })
}
