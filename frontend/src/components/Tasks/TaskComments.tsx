import type { Comment } from "@/types"
import { api } from "@/api/client"
import { useToast } from "@/store/ToastContext"
import { formatDateTime } from "@/utils/helpers"
import { useState } from "react"

interface Props {
  taskId: number
  comments: Comment[]
  onCommentChange: () => void
}

export default function TaskComments({ taskId, comments, onCommentChange }: Props) {
  const [newComment, setNewComment] = useState("")
  const { addToast } = useToast()

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    try {
      await api.comments.add(taskId, newComment)
      setNewComment("")
      onCommentChange()
    } catch {
      addToast("Błąd dodawania komentarza", "error")
    }
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Komentarze</h4>

      <div className="space-y-2">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak komentarzy.</p>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-900 dark:text-white">
                  {comment.author}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(comment.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{comment.text}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={event => setNewComment(event.target.value)}
          onKeyDown={event => event.key === "Enter" && void handleAddComment()}
          placeholder="Dodaj komentarz..."
          className="input flex-1"
        />
        <button
          onClick={() => void handleAddComment()}
          className="btn btn-secondary btn-sm"
        >
          Wyślij
        </button>
      </div>
    </section>
  )
}
