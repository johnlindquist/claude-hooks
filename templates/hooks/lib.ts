#!/usr/bin/env bun

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// Input payload types based on official Claude Code schemas
export interface PreToolUsePayload {
  session_id: string
  transcript_path: string
  tool_name: string
  tool_input: Record<string, any>
}

export interface PostToolUsePayload {
  session_id: string
  transcript_path: string
  tool_name: string
  tool_input: Record<string, any>
  tool_response: Record<string, any> & {
    success?: boolean
  }
}

export interface NotificationPayload {
  session_id: string
  transcript_path: string
  message: string
  title: string
}

export interface StopPayload {
  session_id: string
  transcript_path: string
  stop_hook_active: boolean
}

export interface SubagentStopPayload {
  session_id: string
  transcript_path: string
  stop_hook_active: boolean
}

export type HookPayload =
  | (PreToolUsePayload & {hook_type: 'PreToolUse'})
  | (PostToolUsePayload & {hook_type: 'PostToolUse'})
  | (NotificationPayload & {hook_type: 'Notification'})
  | (StopPayload & {hook_type: 'Stop'})
  | (SubagentStopPayload & {hook_type: 'SubagentStop'})

// Base response fields available to all hooks
export interface BaseHookResponse {
  continue?: boolean
  stopReason?: string
  suppressOutput?: boolean
}

// PreToolUse specific response
export interface PreToolUseResponse extends BaseHookResponse {
  decision?: 'approve' | 'block'
  reason?: string
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
export type PostToolUseHandler = (payload: PostToolUsePayload) => Promise<void> | void
export type NotificationHandler = (payload: NotificationPayload) => Promise<void> | void
export type StopHandler = (payload: StopPayload) => Promise<void> | void
export type SubagentStopHandler = (payload: SubagentStopPayload) => Promise<void> | void

export interface HookHandlers {
  preToolUse?: PreToolUseHandler
  postToolUse?: PostToolUseHandler
  notification?: NotificationHandler
  stop?: StopHandler
  subagentStop?: SubagentStopHandler
}

// Session management utilities
const SESSIONS_DIR = path.join(process.cwd(), '.claude', 'hooks', 'sessions')

export async function ensureSessionsDirectory(): Promise<void> {
  try {
    await fs.mkdir(SESSIONS_DIR, {recursive: true})
  } catch (error) {
    console.error('Failed to create sessions directory:', error)
  }
}

export async function saveSessionData(hookType: string, payload: any): Promise<void> {
  try {
    const timestamp = new Date().toISOString()
    const sessionFile = path.join(SESSIONS_DIR, `${payload.session_id}.json`)

    let sessionData: any[] = []
    try {
      const existing = await fs.readFile(sessionFile, 'utf-8')
      sessionData = JSON.parse(existing)
    } catch {
      // File doesn't exist yet
    }

    sessionData.push({
      timestamp,
      hookType,
      payload,
    })

    await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2))
  } catch (error) {
    console.error('Failed to save session data:', error)
  }
}

// Logging utility
export function log(...args: any[]): void {
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
        hook_type: hook_type as any,
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
            await handlers.postToolUse(payload)
          }
          console.log(JSON.stringify({}))
          break

        case 'Notification':
          if (handlers.notification) {
            await handlers.notification(payload)
          }
          console.log(JSON.stringify({}))
          break

        case 'Stop':
          if (handlers.stop) {
            await handlers.stop(payload)
          }
          console.log(JSON.stringify({}))
          process.exit(0)
          return // Unreachable but satisfies linter

        case 'SubagentStop':
          if (handlers.subagentStop) {
            await handlers.subagentStop(payload)
          }
          console.log(JSON.stringify({}))
          process.exit(0)
          return // Unreachable but satisfies linter

        default:
          console.log(JSON.stringify({}))
      }
    } catch (error) {
      console.error('Hook error:', error)
      console.log(JSON.stringify({action: 'continue'}))
    }
  })
}
