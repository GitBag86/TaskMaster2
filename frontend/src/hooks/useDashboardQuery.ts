import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export function useDashboardStatsQuery() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.stats.dashboard(),
  })
}

export function useWeeklyReportQuery() {
  return useQuery({
    queryKey: ['dashboard', 'weekly-report'],
    queryFn: () => api.stats.weekly(),
  })
}

export function useDashboardDataQuery() {
  return useQuery({
    queryKey: ['dashboard', 'full'],
    queryFn: async () => {
      const [stats, board, report] = await Promise.all([
        api.stats.dashboard(),
        api.tasks.dependencyBoard(),
        api.stats.weekly(),
      ])
      return { stats, board, report }
    },
    staleTime: 30_000,
  })
}
