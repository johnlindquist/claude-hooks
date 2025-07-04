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

// PreToolUse handler - called before Claude uses any tool
async function preToolUse(payload: PreToolUsePayload): Promise<HookResponse> {
  // Save session data (optional - remove if not needed)
  await saveSessionData('PreToolUse', payload)

  // Example: Log when Claude is about to edit files
  if (payload.tool_name === 'Edit' && payload.tool_input) {
    const {file_path} = payload.tool_input as any
    console.log(`📝 Claude is editing: ${file_path}`)
  }

  // Example: Track bash commands
  if (payload.tool_name === 'Bash' && payload.tool_input && 'command' in payload.tool_input) {
    const bashInput = payload.tool_input as BashToolInput
    console.log(`🚀 Running command: ${bashInput.command}`)
  }

  // Add your custom logic here!
  // You have full TypeScript support and can use any npm packages

  return {action: 'continue'}
}

// PostToolUse handler - called after Claude uses a tool
async function postToolUse(payload: PostToolUsePayload): Promise<void> {
  // Save session data (optional - remove if not needed)
  await saveSessionData('PostToolUse', payload)

  // Example: React to successful file writes
  if (payload.tool_name === 'Write' && payload.success) {
    console.log(`✅ File written successfully!`)
  }

  // Add your custom post-processing logic here
}

// Notification handler - receive Claude's notifications
async function notification(payload: NotificationPayload): Promise<void> {
  await saveSessionData('Notification', payload)

  // Example: Log Claude's progress
  console.log(`🔔 ${payload.message}`)
}

// Stop handler - called when Claude stops
async function stop(payload: StopPayload): Promise<void> {
  await saveSessionData('Stop', payload)

  // Example: Summary or cleanup logic
  console.log(`👋 Session ended: ${payload.reason}`)
}

// Run the hook with our handlers
runHook({
  preToolUse,
  postToolUse,
  notification,
  stop,
})
