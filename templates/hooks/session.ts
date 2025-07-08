import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import type {HookPayload} from './lib'

const SESSIONS_DIR = path.join(tmpdir(), 'claude-hooks-sessions')

export async function saveSessionData(hookType: string, payload: HookPayload): Promise<void> {
  try {
    // Ensure sessions directory exists
    await mkdir(SESSIONS_DIR, {recursive: true})

    const timestamp = new Date().toISOString()
    const sessionFile = path.join(SESSIONS_DIR, `${payload.session_id}.json`)

    let sessionData: Array<{timestamp: string; hookType: string; payload: HookPayload}> = []
    try {
      const existing = await readFile(sessionFile, 'utf-8')
      sessionData = JSON.parse(existing)
    } catch {
      // File doesn't exist yet
    }

    sessionData.push({
      timestamp,
      hookType,
      payload,
    })

    await writeFile(sessionFile, JSON.stringify(sessionData, null, 2))
  } catch (error) {
    console.error('Failed to save session data:', error)
  }
}
