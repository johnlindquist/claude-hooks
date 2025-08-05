// This file contains types and utilities for Claude hooks
// DO NOT MODIFY - This is auto-generated

export interface HookArgs {
  type: 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop' | 'SessionStart'
  // PreToolUse event data
  toolName?: string
  toolArgs?: unknown
  // PostToolUse event data
  toolResult?: unknown
  // Notification event data
  message?: string
  severity?: 'info' | 'warning' | 'error'
  // SessionStart event data
  sessionId?: string
  userId?: string
  workingDirectory?: string
  platform?: string
  osVersion?: string
  gitBranch?: string
  gitRemoteUrl?: string
  gitSha?: string
  gitStatus?: string
  gitRecentCommits?: string[]
  startTime?: string
  commandArgs?: string[]
  isGitRepo?: boolean
  claudeDesktopVersion?: string
  isPlanMode?: boolean
}

export interface HookResult {
  // Block the action (only for PreToolUse)
  block?: boolean
  // Message to display
  message?: string
  // Modified tool arguments (only for PreToolUse)
  toolArgs?: unknown
}

export type HookHandler = (args: HookArgs) => HookResult | void | Promise<HookResult | void>

interface Handlers {
  PreToolUse?: HookHandler
  PostToolUse?: HookHandler
  Notification?: HookHandler
  Stop?: HookHandler
  SessionStart?: HookHandler
}

// Cache for transcript reading
let transcriptCache: {
  path: string | null
  content: string[] | null
  lastRead: number
} = {
  path: null,
  content: null,
  lastRead: 0,
}

const CACHE_TTL = 5000 // 5 seconds

export function getTranscript(): string[] {
  const transcriptPath = process.env.TRANSCRIPT_PATH
  if (!transcriptPath) {
    return []
  }

  const now = Date.now()

  // Return cached content if still valid
  if (
    transcriptCache.path === transcriptPath &&
    transcriptCache.content &&
    now - transcriptCache.lastRead < CACHE_TTL
  ) {
    return transcriptCache.content
  }

  try {
    const fs = require('fs')
    const content = fs.readFileSync(transcriptPath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    // Update cache
    transcriptCache = {
      path: transcriptPath,
      content: lines,
      lastRead: now,
    }

    return lines
  } catch (error) {
    return []
  }
}

export function getTranscriptStream(): AsyncIterable<string> {
  const transcriptPath = process.env.TRANSCRIPT_PATH
  if (!transcriptPath) {
    return (async function* () {})()
  }

  const fs = require('fs')
  const readline = require('readline')

  try {
    const fileStream = fs.createReadStream(transcriptPath)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    })

    return rl
  } catch (error) {
    return (async function* () {})()
  }
}

export function searchTranscript(
  query: string | RegExp,
  options?: {
    caseSensitive?: boolean
    maxResults?: number
    reverse?: boolean
  },
): string[] {
  const transcript = getTranscript()
  const {caseSensitive = false, maxResults = Infinity, reverse = false} = options || {}

  const results: string[] = []
  const searchArray = reverse ? transcript.slice().reverse() : transcript

  for (const line of searchArray) {
    if (results.length >= maxResults) break

    if (typeof query === 'string') {
      const matches = caseSensitive ? line.includes(query) : line.toLowerCase().includes(query.toLowerCase())
      if (matches) results.push(line)
    } else {
      if (query.test(line)) results.push(line)
    }
  }

  return results
}

export function getLastNMessages(n: number): string[] {
  const transcript = getTranscript()
  return transcript.slice(-n)
}

export function getMessagesSince(timestamp: Date): string[] {
  const transcript = getTranscript()
  const timestampStr = timestamp.toISOString()

  const index = transcript.findIndex((line) => {
    const match = line.match(/^\[([\d-T:.Z]+)\]/)
    if (match && match[1] >= timestampStr) {
      return true
    }
    return false
  })

  return index === -1 ? [] : transcript.slice(index)
}

export function findToolUsage(toolName: string): Array<{line: string; index: number}> {
  const transcript = getTranscript()
  const results: Array<{line: string; index: number}> = []

  transcript.forEach((line, index) => {
    if (line.includes(`tool_name="${toolName}"`) || line.includes(`"toolName":"${toolName}"`)) {
      results.push({line, index})
    }
  })

  return results
}

export function getUserMessages(): string[] {
  return searchTranscript(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] human:/)
}

export function getAssistantMessages(): string[] {
  return searchTranscript(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] assistant:/)
}

export function getSystemMessages(): string[] {
  return searchTranscript(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] system:/)
}

// Main hook runner
export function runHooks(handlers: Handlers) {
  // Buffer to collect all STDIN data
  let inputBuffer = ''

  // Read all data from stdin
  process.stdin.on('data', (chunk) => {
    inputBuffer += chunk.toString()
  })

  // Process once all data is received
  process.stdin.on('end', async () => {
    try {
      const input = JSON.parse(inputBuffer) as HookArgs
      const handler = handlers[input.type]

      if (handler) {
        const result = await handler(input)
        if (result) {
          console.log(JSON.stringify(result))
        }
      }
    } catch (error) {
      // Silently fail to avoid interfering with Claude
      console.error(
        JSON.stringify({
          message: `Hook error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
        }),
      )
    }
  })

  // Handle errors on stdin
  process.stdin.on('error', (error) => {
    console.error(
      JSON.stringify({
        message: `STDIN error: ${error.message}`,
        severity: 'error',
      }),
    )
  })
}
