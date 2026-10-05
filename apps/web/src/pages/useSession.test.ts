import { act, renderHook, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { getMe, logout } from '../api/auth'
import { useSession } from './useSession'

vi.mock('../api/auth', () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
}))

const me = {
  id: 1,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  createdAt: '2026-10-02T12:00:00.000Z',
  links: { self: '/users/1' },
}

function httpError(status: number): AxiosError {
  return new AxiosError('failed', 'ERR', undefined, null, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

describe('useSession', () => {
  beforeEach(() => {
    vi.mocked(getMe).mockReset()
    vi.mocked(logout).mockReset()
  })

  it('starts as loading and reports not authenticated while probing', () => {
    vi.mocked(getMe).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useSession())

    expect(result.current.status).toBe('loading')
    // Loading is treated as not authenticated so the UI can render a stable
    // single control from the first paint.
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('becomes authenticated with the user when the probe succeeds', async () => {
    vi.mocked(getMe).mockResolvedValue(me)

    const { result } = renderHook(() => useSession())

    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(me)
  })

  it('becomes anonymous on a 401', async () => {
    vi.mocked(getMe).mockRejectedValue(httpError(401))

    const { result } = renderHook(() => useSession())

    await waitFor(() => expect(result.current.status).toBe('anonymous'))
    expect(result.current.user).toBeUndefined()
  })

  it('also becomes anonymous when the probe fails for another reason', async () => {
    // The feed is public, so a flaky probe must still render the page — just
    // with the anonymous controls.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(getMe).mockRejectedValue(httpError(500))

    const { result } = renderHook(() => useSession())

    await waitFor(() => expect(result.current.status).toBe('anonymous'))
  })

  it('signs out through the API and drops the local state', async () => {
    vi.mocked(getMe).mockResolvedValue(me)
    vi.mocked(logout).mockResolvedValue()

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    await act(async () => {
      await result.current.signOut()
    })

    expect(logout).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('anonymous')
    expect(result.current.user).toBeUndefined()
  })

  it('still signs out locally when the logout request fails', async () => {
    vi.mocked(getMe).mockResolvedValue(me)
    vi.mocked(logout).mockRejectedValue(httpError(500))

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    await act(async () => {
      await result.current.signOut()
    })

    expect(result.current.status).toBe('anonymous')
  })

  it('forgets the session when a request reveals the cookie expired', async () => {
    vi.mocked(getMe).mockResolvedValue(me)

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    act(() => {
      result.current.forgetSession()
    })

    expect(result.current.status).toBe('anonymous')
    // No logout request: the cookie is already gone server-side.
    expect(logout).not.toHaveBeenCalled()
  })

  it('aborts the probe when unmounted', () => {
    vi.mocked(getMe).mockReturnValue(new Promise(() => {}))

    const { unmount } = renderHook(() => useSession())
    unmount()

    const signal = vi.mocked(getMe).mock.calls[0][0]
    expect(signal?.aborted).toBe(true)
  })
})
