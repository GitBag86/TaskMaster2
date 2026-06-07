import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export function useCalendarTasksQuery() {
  return useQuery({
    queryKey: ['calendar', 'tasks'],
    queryFn: () => api.tasks.getAll(1, 300),
    staleTime: 30_000,
  })
}
