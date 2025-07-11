#!/usr/bin/env bun

import type {
  NotificationPayload,
  PostToolUsePayload,
  PreToolUsePayload,
  PreToolUseResponse,
  StopPayload,
  SubagentStopPayload,
} from './lib'

import {runHook} from './lib'
import {saveSessionData} from './session'

// PreToolUse handler - called before Claude uses any tool
async function preToolUse(payload: PreToolUsePayload): Promise<PreToolUseResponse> {
  // Save session data (optional - remove if not needed)
  await saveSessionData('PreToolUse', {...payload, hook_type: 'PreToolUse'} as const)

  // Example: Log when Claude is about to edit files
  if (payload.tool_name === 'Edit' && payload.tool_input) {
    const {file_path} = payload.tool_input as {file_path: string}
    console.log(`📝 Claude is editing: ${file_path}`)
  }

  // Example: Track bash commands
  if (payload.tool_name === 'Bash' && payload.tool_input && 'command' in payload.tool_input) {
    const command = (payload.tool_input as {command: string}).command
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
  await saveSessionData('PostToolUse', {...payload, hook_type: 'PostToolUse'} as const)

  // Example: React to successful file writes
  if (payload.tool_name === 'Write' && payload.tool_response) {
    console.log(`✅ File written successfully!`)
  }

  // Add your custom post-processing logic here
}

// Notification handler - receive Claude's notifications
async function notification(payload: NotificationPayload): Promise<void> {
  await saveSessionData('Notification', {...payload, hook_type: 'Notification'} as const)

  // Example: Log Claude's progress
  console.log(`🔔 ${payload.message}`)
}

// Stop handler - called when Claude stops
async function stop(payload: StopPayload): Promise<void> {
  await saveSessionData('Stop', {...payload, hook_type: 'Stop'} as const)

  // Example: Summary or cleanup logic
  console.log(`👋 Session ended`)
}

// SubagentStop handler - called when a Claude subagent (Task tool) stops
async function subagentStop(payload: SubagentStopPayload): Promise<void> {
  await saveSessionData('SubagentStop', {...payload, hook_type: 'SubagentStop'} as const)

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
