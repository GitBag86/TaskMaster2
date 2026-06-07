import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface KeyboardShortcutOptions {
  /** Whether shortcuts are enabled (e.g., not in an input field) */
  enabled?: boolean
  /** Timeout in ms for g-prefix sequences */
  gPrefixTimeout?: number
}

/**
 * App-wide keyboard shortcuts:
 * - `n` → new task (calls onNewTask)
 * - `/` → focus search (calls onSearchFocus)
 * - `g` then `d` → /dashboard
 * - `g` then `t` → / (tasks)
 * - `g` then `k` → /kanban
 * - `g` then `c` → /calendar
 * - `g` then `p` → /projects
 * - `g` then `a` → /activity
 * - `?` → show help (calls onShowHelp)
 */
export function useKeyboardShortcuts(
  callbacks: {
    onNewTask?: () => void
    onSearchFocus?: () => void
    onShowHelp?: () => void
  },
  options: KeyboardShortcutOptions = {},
) {
  const navigate = useNavigate()
  const gBufferRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enabled =
    options.enabled ?? true

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only fire when not typing in an input/textarea/select
      const target = event.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      // Allow / to focus search even in inputs (but not if already in one)
      // Allow Escape to close
      if (event.key !== '/' && event.key !== 'Escape' && isInput) return
      if (!enabled) return

      // Ignore modifier keys
      if (event.ctrlKey || event.metaKey || event.altKey) return

      // g-prefix navigation: wait for second key
      if (event.key === 'g') {
        event.preventDefault()
        if (gBufferRef.current) clearTimeout(gBufferRef.current)
        gBufferRef.current = setTimeout(() => {
          gBufferRef.current = null
        }, options.gPrefixTimeout ?? 500)
        return
      }

      // If in g-prefix buffer, handle second key
      if (gBufferRef.current) {
        clearTimeout(gBufferRef.current)
        gBufferRef.current = null

        const navMap: Record<string, string> = {
          d: '/dashboard',
          t: '/',
          k: '/kanban',
          c: '/calendar',
          p: '/projects',
          a: '/activity',
          m: '/team/members',
          i: '/team/invites',
        }

        const path = navMap[event.key.toLowerCase()]
        if (path) {
          event.preventDefault()
          navigate(path)
          return
        }
      }

      // Single-key shortcuts
      switch (event.key.toLowerCase()) {
        case 'n':
          if (callbacks.onNewTask) {
            event.preventDefault()
            callbacks.onNewTask()
          }
          break
        case '/':
          if (!isInput && callbacks.onSearchFocus) {
            event.preventDefault()
            callbacks.onSearchFocus()
          }
          break
        case '?':
          if (callbacks.onShowHelp) {
            event.preventDefault()
            callbacks.onShowHelp()
          }
          break
      }
    },
    [callbacks, enabled, navigate, options.gPrefixTimeout],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (gBufferRef.current) clearTimeout(gBufferRef.current)
    }
  }, [handleKeyDown])
}
