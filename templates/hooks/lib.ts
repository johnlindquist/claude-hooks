#!/usr/bin/env bun

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// Types
export interface PreToolUsePayload {
  hook_type: 'PreToolUse'
  session_id: string
  tool_name: string
  tool_input: Record<string, any>
}

export interface PostToolUsePayload {
  hook_type: 'PostToolUse'
  session_id: string
  tool_name: string
  tool_input: Record<string, any>
  tool_result: any
  tool_error: string | null
}

export interface NotificationPayload {
  hook_type: 'Notification'
  session_id: string
  message: string
  level: 'info' | 'warning' | 'error'
}

export interface StopPayload {
  hook_type: 'Stop'
  session_id: string
}

export type HookPayload = PreToolUsePayload | PostToolUsePayload | NotificationPayload | StopPayload

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
export type PreToolUseHandler = (payload: PreToolUsePayload) => Promise<HookResponse> | HookResponse
export type PostToolUseHandler = (payload: PostToolUsePayload) => Promise<void> | void
export type NotificationHandler = (payload: NotificationPayload) => Promise<void> | void
export type StopHandler = (payload: StopPayload) => Promise<void> | void

export interface HookHandlers {
  preToolUse?: PreToolUseHandler
  postToolUse?: PostToolUseHandler
  notification?: NotificationHandler
  stop?: StopHandler
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
      const payload: HookPayload = {
        ...inputData,
        hook_type: hook_type as any,
      }

      switch (hook_type) {
        case 'PreToolUse':
          if (handlers.preToolUse) {
            const response = await handlers.preToolUse(payload)
            console.log(JSON.stringify(response))
          } else {
            console.log(JSON.stringify({action: 'continue'}))
          }
          break

        case 'PostToolUse':
          if (handlers.postToolUse) {
            await handlers.postToolUse(payload)
          }
          console.log(JSON.stringify({action: 'continue'}))
          break

        case 'Notification':
          if (handlers.notification) {
            await handlers.notification(payload)
          }
          console.log(JSON.stringify({action: 'continue'}))
          break

        case 'Stop':
          if (handlers.stop) {
            await handlers.stop(payload)
          }
          console.log(JSON.stringify({action: 'continue'}))
          process.exit(0)
          break

        default:
          console.log(JSON.stringify({action: 'continue'}))
      }
    } catch (error) {
      console.error('Hook error:', error)
      console.log(JSON.stringify({action: 'continue'}))
    }
  })
}
