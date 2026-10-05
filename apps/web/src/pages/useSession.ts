import { useCallback, useEffect, useState } from 'react'
import { getMe, logout } from '../api/auth'
import { isUnauthorized } from '../api/errors'
import type { User } from '../api/types'

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous'

export type Session = {
  status: SessionStatus
  user?: User
  // True while the probe is still running. The sidebar treats this as
  // anonymous so it can render a stable single control from the first paint.
  isAuthenticated: boolean
  signOut: () => Promise<void>
  // Called when a request fails with a 401: the cookie expired mid-visit, so
  // the UI has to stop claiming the person is logged in.
  forgetSession: () => void
}

// The session lives in an httpOnly cookie, invisible to JS, so there is no
// synchronous "is there a token" check any more — the only way to know is to
// ask the API. This probes GET /auth/me once per mount.
//
// It lives in src/pages/ beside usePageMeta because components/ may never
// import src/api/; pages read the session and pass it down as props.
//
// Deliberately a hook and not a context: the two consumers (the sidebar and
// the like/comment controls) are always inside a single page's subtree, and
// pages are never mounted at the same time. If a header is ever hoisted
// outside <Routes>, promote this to a context.
export function useSession(): Session {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [user, setUser] = useState<User>()

  useEffect(() => {
    const controller = new AbortController()

    getMe(controller.signal)
      .then((me) => {
        setUser(me)
        setStatus('authenticated')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // Anything other than a 401 (a network blip, a 500) is also treated
        // as "not logged in" here: the feed is public, so the page still
        // renders, it just renders the anonymous controls.
        if (!isUnauthorized(error)) {
          console.warn('could not read the session', error)
        }
        setStatus('anonymous')
      })

    return () => controller.abort()
  }, [])

  const forgetSession = useCallback(() => {
    setUser(undefined)
    setStatus('anonymous')
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // Best effort: even if the request fails, the short-lived session
      // cookie bounds the exposure. Drop the local state either way.
    }
    setUser(undefined)
    setStatus('anonymous')
  }, [])

  return {
    status,
    user,
    isAuthenticated: status === 'authenticated',
    signOut,
    forgetSession,
  }
}
