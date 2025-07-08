#!/usr/bin/env bun

import {
  type BashToolInput,
  type NotificationPayload,
  type PostToolUsePayload,
  type PreToolUsePayload,
  type PreToolUseResponse,
  runHook,
  type StopPayload,
  type SubagentStopPayload,
} from './lib'
import {saveSessionData} from './session'

// PreToolUse handler - called before Claude uses any tool
async function preToolUse(payload: PreToolUsePayload): Promise<PreToolUseResponse> {
  // Save session data (optional - remove if not needed)
  await saveSessionData('PreToolUse', payload)

  // Example: Log when Claude is about to edit files
  if (payload.tool_name === 'Edit' && payload.tool_input) {
    const {file_path} = payload.tool_input as {file_path: string}
    console.log(`📝 Claude is editing: ${file_path}`)
  }

  // Example: Track bash commands
  if (payload.tool_name === 'Bash' && payload.tool_input && 'command' in payload.tool_input) {
    const bashInput = payload.tool_input as BashToolInput
    const command = bashInput.command
    console.log(`🚀 Running command: ${command}`)

    // Block dangerous commands
    if (command.includes('rm -rf /') || command.includes('rm -rf ~')) {
      console.error('❌ Dangerous command detected! Blocking execution.')
      return {decision: 'block', reason: `Dangerous command detected: ${command}`}
    }
  }

  // Add your custom logic here!
  // You have full TypeScript support and can use any npm packages

  return {} // Empty object means continue with default behavior
}

// PostToolUse handler - called after Claude uses a tool
async function postToolUse(payload: PostToolUsePayload): Promise<void> {
  // Save session data (optional - remove if not needed)
  await saveSessionData('PostToolUse', payload)

  // Example: React to successful file writes
  if (payload.tool_name === 'Write' && payload.tool_response) {
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
  console.log(`👋 Session ended`)
}

// SubagentStop handler - called when a Claude subagent (Task tool) stops
async function subagentStop(payload: SubagentStopPayload): Promise<void> {
  await saveSessionData('SubagentStop', payload)

  // Example: Log subagent completion
  console.log(`🤖 Subagent task completed`)

  // Add your custom subagent cleanup logic here
  // Note: Be careful with stop_hook_active to avoid infinite loops
  if (payload.stop_hook_active) {
    console.log('⚠️  Stop hook is already active, skipping additional processing')
  }
}

// Run the hook with our handlers
runHook({
  preToolUse,
  postToolUse,
  notification,
  stop,
  subagentStop,
})
