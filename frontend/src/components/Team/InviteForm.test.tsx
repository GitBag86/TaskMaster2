import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InviteForm from './InviteForm'

const mockAddToast = vi.fn()
const mockCreateInvite = vi.fn()

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/api/client', () => ({
  api: {
    invites: {
      create: (...args: unknown[]) => mockCreateInvite(...args),
    },
  },
}))

describe('InviteForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates a manual link when no email is provided', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    mockCreateInvite.mockResolvedValue({ id: 1, raw_token: 'raw-token', email: null })

    render(<InviteForm onCreated={onCreated} />)

    expect(screen.getByText('Wygeneruj link')).toBeInTheDocument()
    await user.click(screen.getByText('Wygeneruj link'))

    expect(mockCreateInvite).toHaveBeenCalledWith(undefined)
    expect(onCreated).toHaveBeenCalled()
    expect(screen.getByText('Token widoczny tylko raz')).toBeInTheDocument()
    expect(mockAddToast).toHaveBeenCalledWith('Link zaproszenia wygenerowany', 'success')
  })

  it('sends an invitation to the entered email and hides the raw token', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    mockCreateInvite.mockResolvedValue({
      id: 2,
      email: 'person@example.com',
      email_queued: true,
    })

    render(<InviteForm onCreated={onCreated} />)

    const input = screen.getByPlaceholderText('E-mail (wyślij zaproszenie)')
    await user.type(input, 'person@example.com')
    await user.click(screen.getByText('Wyślij zaproszenie'))

    expect(mockCreateInvite).toHaveBeenCalledWith('person@example.com')
    expect(onCreated).toHaveBeenCalled()
    expect(screen.getByText(/Zaproszenie zostało wysłane na adres/)).toBeInTheDocument()
    expect(screen.queryByText('Token widoczny tylko raz')).not.toBeInTheDocument()
    expect(mockAddToast).toHaveBeenCalledWith('Zaproszenie wysłane na person@example.com', 'success')
  })

  it('shows the manual fallback when email queueing fails', async () => {
    const user = userEvent.setup()
    mockCreateInvite.mockResolvedValue({
      id: 3,
      email: 'person@example.com',
      email_queued: false,
      raw_token: 'fallback-token',
    })

    render(<InviteForm onCreated={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('E-mail (wyślij zaproszenie)'), 'person@example.com')
    await user.click(screen.getByText('Wyślij zaproszenie'))

    expect(screen.getByText('Token widoczny tylko raz')).toBeInTheDocument()
    expect(mockAddToast).toHaveBeenCalledWith(
      'Nie udało się potwierdzić wysyłki — użyj wygenerowanego linku',
      'warning',
    )
  })

  it('does not submit an invalid email address', async () => {
    const user = userEvent.setup()
    render(<InviteForm onCreated={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('E-mail (wyślij zaproszenie)'), 'not-an-email')
    await user.click(screen.getByText('Wyślij zaproszenie'))

    expect(mockCreateInvite).not.toHaveBeenCalled()
    expect(screen.getByText('Nieprawidłowy format adresu email')).toBeInTheDocument()
  })
})
