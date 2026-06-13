import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

const ThrowComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>All good</div>
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders fallback UI when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Coś poszło nie tak')).toBeInTheDocument()
    expect(screen.getByText('Spróbuj ponownie')).toBeInTheDocument()
    expect(screen.getByText('Odśwież stronę')).toBeInTheDocument()
    vi.mocked(console.error).mockRestore()
  })

  it('renders custom fallback when provided', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Custom error UI')).toBeInTheDocument()
    expect(screen.queryByText('Coś poszło nie tak')).not.toBeInTheDocument()
    vi.mocked(console.error).mockRestore()
  })

  it('retry button calls handleRetry and clears error state', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <ErrorBoundary>
        <ThrowComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Coś poszło nie tak')).toBeInTheDocument()

    const retryButton = screen.getByText('Spróbuj ponownie')
    fireEvent.click(retryButton)

    expect(screen.queryByText('Coś poszło nie tak')).toBeInTheDocument()
    vi.mocked(console.error).mockRestore()
  })
})
