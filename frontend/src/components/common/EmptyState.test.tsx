import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Brak zadań" />)
    expect(screen.getByText('Brak zadań')).toBeInTheDocument()
  })

  it('renders default type SVG when no type specified', () => {
    const { container } = render(<EmptyState title="Nic tu nie ma" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <EmptyState
        title="Brak projektów"
        description="Utwórz pierwszy projekt aby zacząć."
      />,
    )
    expect(
      screen.getByText('Utwórz pierwszy projekt aby zacząć.'),
    ).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    render(<EmptyState title="Brak danych" />)
    expect(screen.queryByText('Utwórz')).not.toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    render(
      <EmptyState
        title="Brak projektów"
        action={<button>Nowy projekt</button>}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Nowy projekt' }),
    ).toBeInTheDocument()
  })

  it('renders different SVGs for different types', () => {
    const types = ['tasks', 'search', 'projects', 'calendar', 'kanban', 'team', 'activity', 'default'] as const
    for (const type of types) {
      const { container, unmount } = render(
        <EmptyState type={type} title={`Type: ${type}`} />,
      )
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })

  it('falls back to default SVG for unknown type', () => {
    const { container } = render(
      <EmptyState type={'unknown' as never} title="Fallback" />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
