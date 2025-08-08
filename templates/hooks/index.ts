#!/usr/bin/env bun

import type {HookHandler} from './lib'
import {runHooks} from './lib'

// PreToolUse handler - called before Claude uses any tool
export const PreToolUse: HookHandler = (args) => {
  // Example: Log when Claude is about to edit files
  if (args.toolName === 'Edit' && args.toolArgs) {
    const {file_path} = args.toolArgs as {file_path: string}
    console.error(`📝 Claude is editing: ${file_path}`)
  }

  // Example: Block dangerous bash commands
  if (args.toolName === 'Bash' && args.toolArgs) {
    const {command} = args.toolArgs as {command: string}
    console.error(`🚀 Running command: ${command}`)

    // Block dangerous commands
    if (command.includes('rm -rf /') || command.includes('rm -rf ~')) {
      return {
        block: true,
        message: `Dangerous command blocked: ${command}`,
      }
    }
  }

  // Return nothing to allow the tool to proceed
}

// PostToolUse handler - called after Claude uses a tool
export const PostToolUse: HookHandler = (args) => {
  // Example: React to successful file writes
  if (args.toolName === 'Write' && args.toolResult) {
    console.error('✅ File written successfully!')
  }

  // Add your custom post-processing logic here
}

// Notification handler - receive Claude's notifications
export const Notification: HookHandler = (args) => {
  if (args.message) {
    console.error(`🔔 ${args.severity || 'info'}: ${args.message}`)
  }
}

// Stop handler - called when Claude stops
export const Stop: HookHandler = (_args) => {
  console.error('👋 Session ended')
  // Add cleanup logic here if needed
}

// SessionStart handler - called when a new session starts
export const SessionStart: HookHandler = (args) => {
  console.error(`🚀 New session started: ${args.sessionId}`)

  if (args.workingDirectory) {
    console.error(`📍 Working directory: ${args.workingDirectory}`)
  }

  if (args.isPlanMode) {
    console.error('📋 Plan mode is active')
  }

  // Add your session initialization logic here
}

// Run the hook system with our handlers
runHooks({
  PreToolUse,
  PostToolUse,
  Notification,
  Stop,
  SessionStart,
})