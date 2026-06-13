import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

function TestComponent() {
  const { dark, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme-value">{dark ? 'dark' : 'light'}</span>
      <button data-testid="toggle-btn" onClick={toggle}>Toggle</button>
    </div>
  )
}

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to light theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme-value').textContent).toBe('light')
  })

  it('toggles theme when toggle is called', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme-value').textContent).toBe('light')

    fireEvent.click(screen.getByTestId('toggle-btn'))
    expect(screen.getByTestId('theme-value').textContent).toBe('dark')
  })

  it('applies dark class to document.documentElement', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    fireEvent.click(screen.getByTestId('toggle-btn'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('persists theme choice to localStorage', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByTestId('toggle-btn'))
    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark')
  })

  it('reads initial dark theme from localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('dark')
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme-value').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('uses useTheme hook outside provider', () => {
    // Should not throw - context has default values
    expect(() => render(<TestComponent />)).not.toThrow()
  })
})
