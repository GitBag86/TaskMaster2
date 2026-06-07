import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'

export function useProjectsQuery() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.getAll(),
  })
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: (data: Parameters<typeof api.projects.create>[0]) =>
      api.projects.create(data),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      addToast(`Projekt ${project.name} utworzony`, 'success')
    },
    onError: (err: Error) => {
      addToast(err.message || 'Błąd tworzenia projektu', 'error')
    },
  })
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: Parameters<typeof api.projects.update>[1]
    }) => api.projects.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      addToast('Projekt zaktualizowany', 'success')
    },
    onError: (err: Error) => {
      addToast(err.message || 'Błąd aktualizacji projektu', 'error')
    },
  })
}

export function useCompleteProjectMutation() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: (id: number) => api.projects.complete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      addToast('Projekt zakończony', 'success')
    },
    onError: (err: Error) => {
      addToast(err.message || 'Błąd kończenia projektu', 'error')
    },
  })
}
