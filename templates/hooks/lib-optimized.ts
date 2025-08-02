#!/usr/bin/env bun

import * as fs from 'fs'
import * as readline from 'readline'
import { once } from 'events'

// Cache for transcript data to avoid repeated file reads
const transcriptCache = new Map<string, {data: TranscriptMessage[], timestamp: number}>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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

// Optimized helper to parse JSON safely
function tryParseJSON<T>(line: string): T | null {
  if (!line.trim()) return null
  try {
    return JSON.parse(line) as T
  } catch {
    return null
  }
}

// Stream processor for reading transcripts line by line
async function* readTranscriptLines(transcriptPath: string): AsyncGenerator<TranscriptMessage> {
  const fileStream = fs.createReadStream(transcriptPath, { highWaterMark: 64 * 1024 }) // 64KB chunks
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of rl) {
      const message = tryParseJSON<TranscriptMessage>(line)
      if (message) yield message
    }
  } finally {
    rl.close()
    fileStream.destroy()
  }
}

// Optimized: Returns immediately when first user message is found
export async function getInitialMessage(transcriptPath: string): Promise<string | null> {
  try {
    for await (const message of readTranscriptLines(transcriptPath)) {
      if (message.type === 'user' && message.message.role === 'user') {
        if (typeof message.message.content === 'string') {
          return message.message.content
        }

        if (Array.isArray(message.message.content)) {
          const textContent = message.message.content
            .filter((item): item is { type: 'text'; content: string } => 
              item.type === 'text' && typeof item.content === 'string'
            )
            .map((item) => item.content)
            .join('\n')

          if (textContent) return textContent
        }
      }
    }
    return null
  } catch (error) {
    console.error('Error reading transcript:', error)
    return null
  }
}

// Optimized with caching
export async function getAllMessages(transcriptPath: string, useCache = true): Promise<TranscriptMessage[]> {
  // Check cache first
  if (useCache) {
    const cached = transcriptCache.get(transcriptPath)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data
    }
  }

  const messages: TranscriptMessage[] = []

  try {
    for await (const message of readTranscriptLines(transcriptPath)) {
      messages.push(message)
    }

    // Update cache
    if (useCache) {
      transcriptCache.set(transcriptPath, { data: messages, timestamp: Date.now() })
    }
  } catch (error) {
    console.error('Error reading transcript:', error)
  }

  return messages
}

// Optimized: Stream-based processing for large transcripts
export async function* streamConversationHistory(
  transcriptPath: string,
): AsyncGenerator<{role: 'user' | 'assistant'; content: string}> {
  for await (const message of readTranscriptLines(transcriptPath)) {
    if (message.type === 'summary') continue

    if (message.type === 'user' && message.message.role === 'user') {
      let content = ''

      if (typeof message.message.content === 'string') {
        content = message.message.content
      } else if (Array.isArray(message.message.content)) {
        content = message.message.content
          .filter((item): item is { type: 'text'; content: string } => 
            item.type === 'text' && typeof item.content === 'string'
          )
          .map((item) => item.content)
          .join('\n')
      }

      if (content) {
        yield {role: 'user', content}
      }
    } else if (message.type === 'assistant') {
      const textContent = message.message.content
        .filter((item): item is { type: 'text'; text: string } => 
          item.type === 'text' && typeof item.text === 'string'
        )
        .map((item) => item.text)
        .join('')

      if (textContent) {
        yield {role: 'assistant', content: textContent}
      }
    }
  }
}

// Backwards compatible version that collects all messages
export async function getConversationHistory(
  transcriptPath: string,
): Promise<Array<{role: 'user' | 'assistant'; content: string}>> {
  const conversation: Array<{role: 'user' | 'assistant'; content: string}> = []
  
  for await (const message of streamConversationHistory(transcriptPath)) {
    conversation.push(message)
  }
  
  return conversation
}

// Optimized: Stream-based tool usage extraction
export async function* streamToolUsage(
  transcriptPath: string,
): AsyncGenerator<{tool: string; input: Record<string, unknown>; timestamp: string}> {
  for await (const message of readTranscriptLines(transcriptPath)) {
    if (message.type === 'assistant') {
      const toolUses = message.message.content.filter((item): item is {
        type: 'tool_use'
        name: string
        input: Record<string, unknown>
      } => item.type === 'tool_use' && typeof item.name === 'string' && !!item.input)

      for (const toolUse of toolUses) {
        yield {
          tool: toolUse.name,
          input: toolUse.input,
          timestamp: message.timestamp,
        }
      }
    }
  }
}

// Backwards compatible version
export async function getToolUsage(
  transcriptPath: string,
): Promise<Array<{tool: string; input: Record<string, unknown>; timestamp: string}>> {
  const toolUsage: Array<{tool: string; input: Record<string, unknown>; timestamp: string}> = []
  
  for await (const usage of streamToolUsage(transcriptPath)) {
    toolUsage.push(usage)
  }
  
  return toolUsage
}

// New optimized functions for common operations

// Get last N messages without reading entire file
export async function getLastNMessages(transcriptPath: string, n: number): Promise<TranscriptMessage[]> {
  const messages: TranscriptMessage[] = []
  
  for await (const message of readTranscriptLines(transcriptPath)) {
    messages.push(message)
    if (messages.length > n) {
      messages.shift() // Remove oldest message
    }
  }
  
  return messages
}

// Search for messages containing specific text
export async function* searchMessages(
  transcriptPath: string,
  searchText: string,
  options: { caseSensitive?: boolean; limit?: number } = {}
): AsyncGenerator<TranscriptMessage> {
  const { caseSensitive = false, limit } = options
  const searchLower = caseSensitive ? searchText : searchText.toLowerCase()
  let count = 0

  for await (const message of readTranscriptLines(transcriptPath)) {
    let found = false

    if (message.type === 'user' && typeof message.message.content === 'string') {
      const content = caseSensitive ? message.message.content : message.message.content.toLowerCase()
      if (content.includes(searchLower)) found = true
    } else if (message.type === 'assistant') {
      const textContent = message.message.content
        .filter(item => item.type === 'text' && item.text)
        .map(item => caseSensitive ? item.text : item.text?.toLowerCase())
        .join('')
      
      if (textContent.includes(searchLower)) found = true
    }

    if (found) {
      yield message
      count++
      if (limit && count >= limit) break
    }
  }
}

// Get session metadata efficiently
export async function getSessionMetadata(transcriptPath: string): Promise<{
  sessionId?: string
  version?: string
  cwd?: string
  gitBranch?: string
  firstTimestamp?: string
  lastTimestamp?: string
}> {
  let firstMessage: TranscriptMessage | null = null
  let lastMessage: TranscriptMessage | null = null

  for await (const message of readTranscriptLines(transcriptPath)) {
    if (!firstMessage && (message.type === 'user' || message.type === 'assistant')) {
      firstMessage = message
    }
    if (message.type === 'user' || message.type === 'assistant') {
      lastMessage = message
    }
  }

  if (!firstMessage) return {}

  return {
    sessionId: firstMessage.sessionId,
    version: firstMessage.version,
    cwd: firstMessage.cwd,
    gitBranch: firstMessage.gitBranch,
    firstTimestamp: firstMessage.timestamp,
    lastTimestamp: lastMessage?.timestamp,
  }
}

// Clear cache for a specific transcript or all
export function clearTranscriptCache(transcriptPath?: string): void {
  if (transcriptPath) {
    transcriptCache.delete(transcriptPath)
  } else {
    transcriptCache.clear()
  }
}

// Auto-clear old cache entries
setInterval(() => {
  const now = Date.now()
  for (const [path, cache] of transcriptCache.entries()) {
    if (now - cache.timestamp > CACHE_TTL) {
      transcriptCache.delete(path)
    }
  }
}, CACHE_TTL)

/**
 * Next steps for transcript operations:
 *
 * 1. Session Analysis Functions:
 *    - getSessionMetadata(): Extract session ID, version, CWD, git branch ✓
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
 *    - searchTranscript(): Find messages containing specific keywords ✓
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
 *     const lastMessages = await getLastNMessages(payload.transcript_path, 10)
 *     const lastUserMessage = lastMessages
 *       .filter(m => m.type === 'user')
 *       .pop()
 *
 *     return {
 *       decision: 'approve',
 *       additionalContext: `Recent context available`,
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

// Logging utility with optional structured logging
export function log(...args: unknown[]): void {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

// Optimized hook runner with better error handling
export function runHook(handlers: HookHandlers): void {
  const hook_type = process.argv[2]

  // Set up more efficient stdin handling
  process.stdin.setEncoding('utf8')
  
  let buffer = ''
  
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    
    // Check if we have a complete JSON object
    try {
      const inputData = JSON.parse(buffer)
      buffer = '' // Clear buffer on successful parse
      
      handleHookPayload(inputData, hook_type, handlers).catch((error) => {
        console.error('Hook error:', error)
        console.log(JSON.stringify({action: 'continue'}))
      })
    } catch (e) {
      // Not a complete JSON yet, wait for more data
    }
  })
  
  process.stdin.on('end', () => {
    if (buffer.trim()) {
      console.error('Incomplete JSON in buffer:', buffer)
    }
  })
}

async function handleHookPayload(
  inputData: unknown,
  hook_type: string,
  handlers: HookHandlers
): Promise<void> {
  // Add hook_type for internal processing (not part of official input schema)
  const payload: HookPayload = {
    ...inputData as any,
    hook_type: hook_type as HookPayload['hook_type'],
  }

  let response: any = {}

  switch (payload.hook_type) {
    case 'PreToolUse':
      if (handlers.preToolUse) {
        response = await handlers.preToolUse(payload)
      }
      break

    case 'PostToolUse':
      if (handlers.postToolUse) {
        response = await handlers.postToolUse(payload)
      }
      break

    case 'Notification':
      if (handlers.notification) {
        response = await handlers.notification(payload)
      }
      break

    case 'Stop':
      if (handlers.stop) {
        response = await handlers.stop(payload)
      }
      console.log(JSON.stringify(response))
      process.exit(0)
      return

    case 'SubagentStop':
      if (handlers.subagentStop) {
        response = await handlers.subagentStop(payload)
      }
      console.log(JSON.stringify(response))
      process.exit(0)
      return

    case 'UserPromptSubmit':
      if (handlers.userPromptSubmit) {
        response = await handlers.userPromptSubmit(payload)
      }
      break

    case 'PreCompact':
      if (handlers.preCompact) {
        response = await handlers.preCompact(payload)
      }
      break

    case 'SessionStart':
      if (handlers.sessionStart) {
        response = await handlers.sessionStart(payload)
      }
      break
  }

  console.log(JSON.stringify(response))
}