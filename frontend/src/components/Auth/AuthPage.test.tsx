import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AuthPage from './AuthPage'

const mockLogin = vi.fn()
const mockSignupInfo = vi.fn()
const mockAddToast = vi.fn()

vi.mock('@/store/AuthContext', () => ({
  useAuth: () => ({
    login: (...args: unknown[]) => mockLogin(...args),
    signup: vi.fn(),
  }),
}))

vi.mock('@/store/ThemeContext', () => ({
  useTheme: () => ({ dark: false, toggle: vi.fn() }),
}))

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/api/client', () => ({
  api: {
    signup: {
      info: (...args: unknown[]) => mockSignupInfo(...args),
    },
  },
  ApiError: class ApiError extends Error {},
}))

describe('AuthPage login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignupInfo.mockResolvedValue({ mode: 'invite_only' })
    mockLogin.mockResolvedValue({ id: 1, username: 'person', role: 'user' })
  })

  it('labels the login identifier as username or email', async () => {
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <AuthPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Username lub e-mail')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Username lub e-mail')).toBeInTheDocument()
  })

  it('passes an email identifier to the login handler', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <AuthPage />
      </MemoryRouter>,
    )

    await user.type(await screen.findByPlaceholderText('Username lub e-mail'), 'person@example.com')
    await user.type(document.querySelector('input[type="password"]') as HTMLInputElement, 'P@ssw0rd!')
    await user.click(screen.getByText('Zaloguj się'))

    expect(mockLogin).toHaveBeenCalledWith('person@example.com', 'P@ssw0rd!')
  })
})
