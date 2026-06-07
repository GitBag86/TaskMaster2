import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskComments from './TaskComments'
import type { Comment } from '@/types'

const mockAddToast = vi.fn()
const mockAddComment = vi.fn().mockResolvedValue({ id: 3, author: 'admin', text: 'New comment', created_at: '2024-01-02T00:00:00Z' })
const mockOnCommentChange = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    comments: {
      add: (...args: unknown[]) => mockAddComment(...args),
    },
  },
}))

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

const comments: Comment[] = [
  { id: 1, author: 'Jan', text: 'First comment', created_at: '2024-01-01T10:00:00Z' },
  { id: 2, author: 'Anna', text: 'Second comment', created_at: '2024-01-01T12:00:00Z' },
]

describe('TaskComments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the section title', () => {
    render(<TaskComments taskId={1} comments={[]} onCommentChange={vi.fn()} />)
    expect(screen.getByText('Komentarze')).toBeInTheDocument()
  })

  it('shows empty state when no comments', () => {
    render(<TaskComments taskId={1} comments={[]} onCommentChange={vi.fn()} />)
    expect(screen.getByText('Brak komentarzy.')).toBeInTheDocument()
  })

  it('renders comments list', () => {
    render(<TaskComments taskId={1} comments={comments} onCommentChange={vi.fn()} />)
    expect(screen.getByText('First comment')).toBeInTheDocument()
    expect(screen.getByText('Second comment')).toBeInTheDocument()
  })

  it('renders comment authors', () => {
    render(<TaskComments taskId={1} comments={comments} onCommentChange={vi.fn()} />)
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('renders the input and submit button', () => {
    render(<TaskComments taskId={1} comments={[]} onCommentChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('Dodaj komentarz...')).toBeInTheDocument()
    expect(screen.getByText('Wyślij')).toBeInTheDocument()
  })

  it('calls api.comments.add and onCommentChange on submit', async () => {
    const user = userEvent.setup()
    render(<TaskComments taskId={42} comments={[]} onCommentChange={mockOnCommentChange} />)

    const input = screen.getByPlaceholderText('Dodaj komentarz...')
    await user.type(input, 'New comment')

    const submitBtn = screen.getByText('Wyślij')
    await user.click(submitBtn)

    expect(mockAddComment).toHaveBeenCalledWith(42, 'New comment')
    expect(mockOnCommentChange).toHaveBeenCalled()
  })

  it('does not call API when comment is empty', async () => {
    const user = userEvent.setup()
    render(<TaskComments taskId={1} comments={[]} onCommentChange={mockOnCommentChange} />)

    const submitBtn = screen.getByText('Wyślij')
    await user.click(submitBtn)

    expect(mockAddComment).not.toHaveBeenCalled()
  })

  it('clears the input after successful submission', async () => {
    const user = userEvent.setup()
    render(<TaskComments taskId={1} comments={[]} onCommentChange={mockOnCommentChange} />)

    const input = screen.getByPlaceholderText('Dodaj komentarz...')
    await user.type(input, 'Hello')
    await user.click(screen.getByText('Wyślij'))

    expect(input).toHaveValue('')
  })

  it('submits on Enter key', async () => {
    const user = userEvent.setup()
    render(<TaskComments taskId={1} comments={[]} onCommentChange={mockOnCommentChange} />)

    const input = screen.getByPlaceholderText('Dodaj komentarz...')
    await user.type(input, 'Enter comment{Enter}')

    expect(mockAddComment).toHaveBeenCalledWith(1, 'Enter comment')
  })
})
