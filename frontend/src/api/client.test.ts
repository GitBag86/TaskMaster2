import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError, setAuthErrorHandler, initCsrf, clearCsrf } from './client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createResponse(data: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  }
}

describe('ApiError', () => {
  it('creates error with status and code', () => {
    const err = new ApiError('Not found', 404, { error: 'Not found' }, 'not_found')
    expect(err.message).toBe('Not found')
    expect(err.status).toBe(404)
    expect(err.code).toBe('not_found')
    expect(err.name).toBe('ApiError')
  })
})

describe('initCsrf / clearCsrf', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and caches CSRF token', async () => {
    mockFetch.mockResolvedValue(createResponse({ csrf_token: 'abc123' }))
    await initCsrf()
    expect(mockFetch).toHaveBeenCalledWith('/csrf-token', { credentials: 'include' })
  })

  it('handles CSRF fetch failure gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    await expect(initCsrf()).resolves.toBeUndefined()
  })

  it('clearCsrf resets the cached token', () => {
    clearCsrf()
  })
})

describe('api.auth', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('login sends POST with credentials', async () => {
    mockFetch.mockResolvedValue(createResponse({ message: 'ok', user: { id: 1, username: 'test' } }))
    const result = await api.auth.login('test', 'pass')
    expect(result.user.username).toBe('test')
    expect(mockFetch).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('logout sends POST', async () => {
    mockFetch.mockResolvedValue(createResponse({ message: 'Wylogowano' }))
    const result = await api.auth.logout()
    expect(result.message).toBe('Wylogowano')
    expect(mockFetch).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({ method: 'POST' }))
  })

  it('me sends GET to /auth/me', async () => {
    mockFetch.mockResolvedValue(createResponse({ id: 1, username: 'admin' }))
    const result = await api.auth.me()
    expect(result.username).toBe('admin')
    expect(mockFetch).toHaveBeenCalledWith('/auth/me', expect.any(Object))
  })

  it('forgotPassword sends POST with email', async () => {
    mockFetch.mockResolvedValue(createResponse({ message: 'Email sent' }))
    const result = await api.auth.forgotPassword('user@example.com')
    expect(result.message).toBe('Email sent')
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.email).toBe('user@example.com')
  })

  it('resetPassword sends POST with token and password', async () => {
    mockFetch.mockResolvedValue(createResponse({ message: 'Password changed' }))
    const result = await api.auth.resetPassword('tok123', 'newpass')
    expect(result.message).toBe('Password changed')
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.token).toBe('tok123')
    expect(callBody.password).toBe('newpass')
  })
})

describe('api.tasks', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('getAll builds paginated URL', async () => {
    mockFetch.mockResolvedValue(createResponse({ tasks: [], total: 0 }))
    await api.tasks.getAll(2, 25)
    expect(mockFetch).toHaveBeenCalledWith('/tasks?page=2&per_page=25', expect.any(Object))
  })

  it('create sends POST with task data', async () => {
    mockFetch.mockResolvedValue(createResponse({ id: 1, title: 'New task' }))
    const result = await api.tasks.create({ title: 'New task', priority: 'high' })
    expect(result.title).toBe('New task')
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.title).toBe('New task')
  })

  it('search encodes query parameter', async () => {
    mockFetch.mockResolvedValue(createResponse({ tasks: [] }))
    await api.tasks.search('find me')
    expect(mockFetch).toHaveBeenCalledWith('/tasks/search?q=find%20me', expect.any(Object))
  })

  it('filter builds query string from params', async () => {
    mockFetch.mockResolvedValue(createResponse({ tasks: [] }))
    await api.tasks.filter({ priority: 'high', status: 'todo' })
    expect(mockFetch).toHaveBeenCalledWith('/tasks/filter?priority=high&status=todo', expect.any(Object))
  })
})

describe('api.projects', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('getAll fetches projects', async () => {
    mockFetch.mockResolvedValue(createResponse({ projects: [] }))
    await api.projects.getAll()
    expect(mockFetch).toHaveBeenCalledWith('/projects', expect.any(Object))
  })

  it('update sends PUT with partial data', async () => {
    mockFetch.mockResolvedValue(createResponse({ id: 1, name: 'Updated' }))
    const result = await api.projects.update(1, { name: 'Updated', description: 'New desc' })
    expect(result.name).toBe('Updated')
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
  })
})

describe('api.teams', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('list fetches teams', async () => {
    mockFetch.mockResolvedValue(createResponse({ teams: [] }))
    await api.teams.list()
    expect(mockFetch).toHaveBeenCalledWith('/admin/teams', expect.any(Object))
  })

  it('delete with cascade adds query param', async () => {
    mockFetch.mockResolvedValue(createResponse(undefined, 204))
    await api.teams.delete(1, true)
    expect(mockFetch).toHaveBeenCalledWith('/admin/teams/1?cascade=true', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('CSRF token attachment', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearCsrf()
  })

  it('attaches CSRF token for state-changing requests when token is set', async () => {
    mockFetch.mockResolvedValue(createResponse({ csrf_token: 'csrf123' }))
    await initCsrf()

    mockFetch.mockReset()
    mockFetch.mockResolvedValue(createResponse({ message: 'ok' }))
    await api.auth.login('test', 'pass')

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['X-CSRFToken']).toBe('csrf123')
  })
})

describe('ApiError handling', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearCsrf()
  })

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(createResponse({ error: 'Not found' }, 404))
    await expect(api.auth.me()).rejects.toThrow(ApiError)
  })

  it('ApiError has correct properties on 404', async () => {
    mockFetch.mockResolvedValue(createResponse({ error: 'Not found' }, 404))
    try {
      await api.auth.me()
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
    }
  })

  it('triggers authErrorHandler on session_stale', async () => {
    const handler = vi.fn()
    setAuthErrorHandler(handler)
    mockFetch.mockResolvedValue(createResponse({ error: 'Session stale', code: 'session_stale' }, 401))
    await expect(api.auth.me()).rejects.toThrow(ApiError)
    expect(handler).toHaveBeenCalled()
    setAuthErrorHandler(null)
  })

  it('triggers authErrorHandler on team_archived', async () => {
    const handler = vi.fn()
    setAuthErrorHandler(handler)
    mockFetch.mockResolvedValue(createResponse({ error: 'Team archived', code: 'team_archived' }, 403))
    await expect(api.auth.me()).rejects.toThrow(ApiError)
    expect(handler).toHaveBeenCalled()
    setAuthErrorHandler(null)
  })

  it('does not trigger handler on other errors', async () => {
    const handler = vi.fn()
    setAuthErrorHandler(handler)
    mockFetch.mockResolvedValue(createResponse({ error: 'Bad request' }, 400))
    await expect(api.auth.me()).rejects.toThrow(ApiError)
    expect(handler).not.toHaveBeenCalled()
    setAuthErrorHandler(null)
  })
})
