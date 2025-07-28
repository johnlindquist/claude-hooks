#!/usr/bin/env bun

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

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

export type HookPayload =
  | (PreToolUsePayload & {hook_type: 'PreToolUse'})
  | (PostToolUsePayload & {hook_type: 'PostToolUse'})
  | (NotificationPayload & {hook_type: 'Notification'})
  | (StopPayload & {hook_type: 'Stop'})
  | (SubagentStopPayload & {hook_type: 'SubagentStop'})
  | (UserPromptSubmitPayload & {hook_type: 'UserPromptSubmit'})
  | (PreCompactPayload & {hook_type: 'PreCompact'})

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

export interface HookHandlers {
  preToolUse?: PreToolUseHandler
  postToolUse?: PostToolUseHandler
  notification?: NotificationHandler
  stop?: StopHandler
  subagentStop?: SubagentStopHandler
  userPromptSubmit?: UserPromptSubmitHandler
  preCompact?: PreCompactHandler
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

        default:
          console.log(JSON.stringify({}))
      }
    } catch (error) {
      console.error('Hook error:', error)
      console.log(JSON.stringify({action: 'continue'}))
    }
  })
}