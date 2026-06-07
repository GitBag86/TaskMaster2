import { useState } from "react"
import type { User } from "@/types"
import { api } from "@/api/client"
import { useToast } from "@/store/ToastContext"

interface Props {
  allUsers: User[]
  onProjectCreated: (projectId: number) => void
  onCancel: () => void
}

export default function ProjectForm({ allUsers, onProjectCreated, onCancel }: Props) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState("#3b82f6")
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const { addToast } = useToast()

  const toggleMemberId = (id: string) => {
    setMemberIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id],
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setSubmitting(true)
    try {
      const project = await api.projects.create({
        name: trimmed,
        description: description.trim(),
        color,
        member_ids: memberIds.map(Number),
      })
      onProjectCreated(project.id)
      addToast(`Projekt ${project.name} utworzony`, "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd tworzenia projektu",
        "error",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Nowy projekt
      </h3>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nazwa projektu *
          </label>
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            className="input"
            required
            autoFocus
            disabled={submitting}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Opis
          </label>
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            className="input min-h-[88px]"
            maxLength={500}
            disabled={submitting}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Kolor
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={color}
              onChange={event => setColor(event.target.value)}
              className="h-10 w-14 rounded-md border border-border bg-background p-1"
              disabled={submitting}
            />
            <input
              type="text"
              value={color}
              onChange={event => setColor(event.target.value)}
              className="input"
              pattern="#[0-9a-fA-F]{6}"
              disabled={submitting}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Członkowie projektu
          </label>
          {allUsers.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              Brak użytkowników do przypisania.
            </p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {allUsers.map(member => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-muted dark:text-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={memberIds.includes(String(member.id))}
                    onChange={() => toggleMemberId(String(member.id))}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    disabled={submitting}
                  />
                  <span className="truncate">{member.username}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary btn-sm"
          disabled={submitting}
        >
          Anuluj
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={submitting}
        >
          {submitting ? "Tworzenie..." : "Utwórz projekt"}
        </button>
      </div>
    </form>
  )
}
