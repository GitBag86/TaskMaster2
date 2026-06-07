import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'

// ---- Queries ----

export function useTasksQuery(page = 1, perPage = 50) {
  return useQuery({
    queryKey: ['tasks', 'list', { page, perPage }],
    queryFn: () => api.tasks.getAll(page, perPage),
    staleTime: 15_000, // shorter stale time for lists
  })
}

export function useTasksTodayQuery() {
  return useQuery({
    queryKey: ['tasks', 'today'],
    queryFn: () => api.tasks.today(),
  })
}

export function useDependencyBoardQuery() {
  return useQuery({
    queryKey: ['dashboard', 'dependency-board'],
    queryFn: () => api.tasks.dependencyBoard(),
  })
}

export function useBlockedTasksQuery() {
  return useQuery({
    queryKey: ['tasks', 'blocked'],
    queryFn: () => api.tasks.blocked(),
  })
}

export function useTasksByProjectQuery() {
  return useQuery({
    queryKey: ['tasks', 'by-project'],
    queryFn: () => api.tasks.byProject(),
  })
}

// ---- Mutations ----

export function useCreateTaskMutation() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: (data: Parameters<typeof api.tasks.create>[0]) =>
      api.tasks.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      addToast('Zadanie utworzone', 'success')
    },
    onError: (err: Error) => {
      addToast(err.message || 'Błąd tworzenia zadania', 'error')
    },
  })
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.tasks.update>[1] }) =>
      api.tasks.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      addToast('Zadanie zaktualizowane', 'success')
    },
    onError: (err: Error) => {
      addToast(err.message || 'Błąd aktualizacji zadania', 'error')
    },
  })
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: (id: number) => api.tasks.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      addToast('Zadanie usunięte', 'success')
    },
    onError: (err: Error) => {
      addToast(err.message || 'Błąd usuwania zadania', 'error')
    },
  })
}

export function useCompleteTaskMutation() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: (id: number) => api.tasks.complete(id),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      addToast(data.completed ? 'Zadanie zakończone' : 'Zadanie przywrócone', 'success')
    },
    onError: (err: Error) => {
      addToast(err.message || 'Błąd zmiany stanu', 'error')
    },
  })
}

export function useBulkCompleteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskIds: number[]) => api.tasks.bulkComplete(taskIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useBulkDeleteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskIds: number[]) => api.tasks.bulkDelete(taskIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useBulkUpdateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      taskIds,
      updates,
    }: {
      taskIds: number[]
      updates: Parameters<typeof api.tasks.bulkUpdate>[1]
    }) => api.tasks.bulkUpdate(taskIds, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
