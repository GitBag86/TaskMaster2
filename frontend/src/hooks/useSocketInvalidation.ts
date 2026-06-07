import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSocket } from '@/store/SocketContext'
import { useAuth } from '@/store/AuthContext'

/** Map of socket event actions → query keys to invalidate. */
const INVALIDATION_MAP: Record<string, string[]> = {
  // Task changes → invalidate all task-related queries
  created:       ['tasks', 'dashboard', 'calendar', 'projects'],
  updated:       ['tasks', 'dashboard', 'projects'],
  completed:     ['tasks', 'dashboard', 'calendar', 'projects'],
  reopened:      ['tasks', 'dashboard', 'projects'],
  commented:     ['tasks', 'activity'],
  mentioned:     ['tasks', 'activity'],
  deleted:       ['tasks', 'dashboard', 'calendar', 'projects'],
  subtask_created:    ['tasks', 'dashboard'],
  subtask_completed:  ['tasks', 'dashboard'],
  subtask_reopened:   ['tasks', 'dashboard'],
  subtask_deleted:    ['tasks', 'dashboard'],
  dependency_added:   ['tasks', 'dashboard'],
  dependency_removed: ['tasks', 'dashboard'],
  bulk_completed: ['tasks', 'dashboard', 'projects'],
  bulk_deleted:   ['tasks', 'dashboard', 'projects'],
  bulk_updated:   ['tasks', 'dashboard', 'projects'],
  project_created:  ['projects'],
  project_updated:  ['projects'],
  project_archived: ['projects'],
  project_completed: ['projects'],
}

/** Register Socket.IO event driven cache invalidation. */
export function useSocketInvalidation() {
  const queryClient = useQueryClient()
  const { lastTaskEvent } = useSocket()
  const { user } = useAuth()

  useEffect(() => {
    if (!lastTaskEvent) return
    // Skip events from self — the mutation already invalidated
    if (lastTaskEvent.user === user?.username) return

    const queryKeys = INVALIDATION_MAP[lastTaskEvent.action]
    if (!queryKeys) return

    // Deduplicate keys before invalidating
    const uniqueKeys = [...new Set(queryKeys)]
    for (const key of uniqueKeys) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [lastTaskEvent, queryClient, user?.username])
}
