#!/usr/bin/env bun

import {
  type BashToolInput,
  type HookResponse,
  type NotificationPayload,
  type PostToolUsePayload,
  type PreToolUsePayload,
  runHook,
  type StopPayload,
} from './lib'
import {saveSessionData} from './session'

// PreToolUse handler - validate and potentially block dangerous commands
async function preToolUse(payload: PreToolUsePayload): Promise<HookResponse> {
  // Save session data
  await saveSessionData('PreToolUse', payload)

  // Example: Block dangerous commands
  if (payload.tool_name === 'Bash' && payload.tool_input && 'command' in payload.tool_input) {
    const bashInput = payload.tool_input as BashToolInput
    const command = bashInput.command

    // Block rm -rf commands
    if (command && (command.includes('rm -rf /') || command.includes('rm -rf ~'))) {
      return {
        action: 'block',
        stopReason: 'Dangerous command detected: rm -rf on system directories',
      }
    }
  }

  // Allow all other commands
  return {action: 'continue'}
}

// PostToolUse handler - log tool results
async function postToolUse(payload: PostToolUsePayload): Promise<void> {
  await saveSessionData('PostToolUse', payload)
}

// Notification handler - log notifications
async function notification(payload: NotificationPayload): Promise<void> {
  await saveSessionData('Notification', payload)
}

// Stop handler - log session end
async function stop(payload: StopPayload): Promise<void> {
  await saveSessionData('Stop', payload)
}

// Run the hook with our handlers
runHook({
  preToolUse,
  postToolUse,
  notification,
  stop,
})
