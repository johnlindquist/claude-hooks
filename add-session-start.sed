#!/bin/sed -f

# Add SessionStartPayload interface after PreCompactPayload
/^}$/,/^export type HookPayload/ {
  /^export type HookPayload/ i\
\
export interface SessionStartPayload {\
  session_id: string\
  transcript_path: string\
  hook_event_name: 'SessionStart'\
  source: string\
}
}

# Add SessionStart to HookPayload union type
/| (PreCompactPayload & {hook_type: 'PreCompact'})$/ a\
  | (SessionStartPayload & {hook_type: 'SessionStart'})

# Add SessionStartResponse interface after PreCompactResponse
/^}$/,/^\/\/ Legacy simple response/ {
  /^\/\/ Legacy simple response/ i\
\
// SessionStart specific response\
export interface SessionStartResponse extends BaseHookResponse {\
  decision?: 'approve' | 'block'\
  reason?: string\
  hookSpecificOutput?: {\
    hookEventName: 'SessionStart'\
    additionalContext?: string\
  }\
}
}

# Add SessionStartHandler type after PreCompactHandler
/^export type PreCompactHandler.*$/ a\
export type SessionStartHandler = (payload: SessionStartPayload) => Promise<SessionStartResponse> | SessionStartResponse

# Add sessionStart to HookHandlers interface
/  preCompact\?: PreCompactHandler$/ a\
  sessionStart?: SessionStartHandler

# Add SessionStart case in runHook switch statement
/case 'PreCompact':.*$/,/break$/ {
  /break$/ a\
\
      case 'SessionStart':\
        if (handlers.sessionStart) {\
          const response = await handlers.sessionStart(payload)\
          console.log(JSON.stringify(response))\
        } else {\
          console.log(JSON.stringify({}))\
        }\
        break
}