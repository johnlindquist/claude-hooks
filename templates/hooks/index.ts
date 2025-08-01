#!/usr/bin/env bun

import type {
  NotificationHandler,
  PostToolUseHandler,
  PreCompactHandler,
  PreToolUseHandler,
  SessionStartHandler,
  StopHandler,
  SubagentStopHandler,
  UserPromptSubmitHandler,
} from './lib'
import {runHook} from './lib'
import {saveSessionData} from './session'

// SessionStart handler - called when a new Claude session starts
const sessionStart: SessionStartHandler = async (payload) => {
  // Save session data (optional - remove if not needed)
  await saveSessionData('SessionStart', {...payload, hook_type: 'SessionStart'} as const)

  // Example: Log session start with source
  console.log(`🚀 New session started from: ${payload.source}`)
  console.log(`📍 Session ID: ${payload.session_id}`)

  // Example: Load user preferences or configuration
  // const userConfig = await loadUserPreferences()

  // Example: Set up session-specific resources
  // await initializeSessionResources(payload.session_id)

  // Example: Apply different behavior based on session source
  if (payload.source === 'vscode') {
    console.log('👨‍💻 VS Code session detected - enabling IDE-specific features')
  } else if (payload.source === 'web') {
    console.log('🌐 Web session detected')
  }

  // Add your custom session initialization logic here

  return {} // Empty object means continue normally
}

// PreToolUse handler - called before Claude uses any tool
// This handler can block tool execution by returning a deny decision
const preToolUse: PreToolUseHandler = async (payload) => {
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
      return {
        permissionDecision: 'deny',
        permissionDecisionReason: `Dangerous command detected: ${command}`,
      }
    }
  }

  // Add your custom logic here!
  // You have full TypeScript support and can use any npm packages

  return {} // Empty object means continue with default behavior
}

// PostToolUse handler - called after Claude uses a tool
const postToolUse: PostToolUseHandler = async (payload) => {
  // Save session data (optional - remove if not needed)
  await saveSessionData('PostToolUse', {...payload, hook_type: 'PostToolUse'} as const)

  // Example: React to successful file writes
  if (payload.tool_name === 'Write' && payload.tool_response) {
    console.log(`✅ File written successfully!`)
  }

  // Add your custom post-processing logic here

  return {} // Return empty object to continue normally
}

// Notification handler - receive Claude's notifications
const notification: NotificationHandler = async (payload) => {
  await saveSessionData('Notification', {...payload, hook_type: 'Notification'} as const)

  // Example: Log Claude's progress
  console.log(`🔔 ${payload.message}`)

  return {} // Return empty object to continue normally
}

// Stop handler - called when Claude stops
const stop: StopHandler = async (payload) => {
  await saveSessionData('Stop', {...payload, hook_type: 'Stop'} as const)

  // Example: Summary or cleanup logic
  console.log(`👋 Session ended`)

  return {} // Return empty object to continue normally
}

// SubagentStop handler - called when a Claude subagent (Task tool) stops
const subagentStop: SubagentStopHandler = async (payload) => {
  await saveSessionData('SubagentStop', {...payload, hook_type: 'SubagentStop'} as const)

  // Example: Log subagent completion
  console.log(`🤖 Subagent task completed`)

  // Add your custom subagent cleanup logic here
  // Note: Be careful with stop_hook_active to avoid infinite loops
  if (payload.stop_hook_active) {
    console.log('⚠️  Stop hook is already active, skipping additional processing')
  }

  return {} // Return empty object to continue normally
}

// UserPromptSubmit handler - called when the user submits a prompt
const userPromptSubmit: UserPromptSubmitHandler = async (payload) => {
  await saveSessionData('UserPromptSubmit', {...payload, hook_type: 'UserPromptSubmit'} as const)

  // Example: Log user prompts
  console.log(`💬 User prompt: ${payload.prompt}`)

  // Example: Add context files automatically based on prompt content
  const contextFiles: string[] = []
  if (payload.prompt.toLowerCase().includes('test')) {
    // Automatically include test files when user mentions testing
    contextFiles.push('**/*.test.ts', '**/*.test.js')
    console.log('📁 Auto-adding test files to context')
  }

  // Example: Validate or modify prompts
  if (payload.prompt.includes('delete all')) {
    console.error('⚠️  Dangerous prompt detected! Blocking.')
    return {decision: 'block', reason: 'Prompts containing "delete all" are not allowed'}
  }

  // Add your custom prompt processing logic here

  return contextFiles.length > 0 ? {contextFiles} : {}
}

// PreCompact handler - called before Claude compacts the conversation
const preCompact: PreCompactHandler = async (payload) => {
  await saveSessionData('PreCompact', {...payload, hook_type: 'PreCompact'} as const)

  // Example: Log compact events
  console.log(`🗜️  Compact triggered: ${payload.trigger}`)

  // Example: Block automatic compaction during critical operations
  if (payload.trigger === 'auto') {
    // You could check if critical operations are in progress
    // For now, we'll allow all compactions
    console.log('📋 Allowing automatic compaction')
  }

  // Add your custom compaction logic here

  return {} // Empty object means allow compaction
}

// Run the hook with our handlers
runHook({
  sessionStart,
  preToolUse,
  postToolUse,
  notification,
  stop,
  subagentStop,
  userPromptSubmit,
  preCompact,
})
