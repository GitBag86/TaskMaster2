import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import TaskDetail from './TaskDetail'

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.tasks.get(Number(id))
      .then(setTask)
      .catch(err => {
        addToast(err instanceof Error ? err.message : 'Nie znaleziono zadania', 'error')
        navigate('/')
      })
      .finally(() => setLoading(false))
  }, [id, navigate, addToast])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!task) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 text-sm text-primary hover:underline"
        >
          &larr; Wróć
        </button>
        <TaskDetail
          task={task}
          onDelete={async (taskId) => {
            await api.tasks.delete(taskId)
            navigate('/')
          }}
          onComplete={async (taskId) => {
            const result = await api.tasks.complete(taskId)
            setTask(prev => prev ? { ...prev, completed: result.completed, status: result.completed ? 'done' : prev.status } : prev)
          }}
          onUpdate={(updated) => setTask(updated)}
          onClose={() => navigate('/')}
        />
      </div>
    </div>
  )
}