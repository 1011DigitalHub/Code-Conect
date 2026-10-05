import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { api } from './client'

const originalAdapter = api.defaults.adapter

// Stands in for the network: records the request and answers with a fixed status.
function fakeServer(status: number) {
  const requests: InternalAxiosRequestConfig[] = []
  api.defaults.adapter = async (config) => {
    requests.push(config)
    const response = { data: {}, status, statusText: '', headers: {}, config }
    if (status >= 400) {
      throw new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
    }
    return response
  }
  return requests
}

function clearAllCookies() {
  for (const row of document.cookie.split(';')) {
    const name = row.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

describe('api client', () => {
  afterEach(() => {
    api.defaults.adapter = originalAdapter
    clearAllCookies()
  })

  it('sends credentials, so the httpOnly session cookie travels', () => {
    expect(api.defaults.withCredentials).toBe(true)
  })

  it('never writes anything to localStorage or sessionStorage', async () => {
    document.cookie = 'csrf_token=nonce.mac; path=/'
    fakeServer(200)

    await api.get('/auth/me')
    await api.post('/auth/login', {})

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('sends the csrf_token cookie value as X-CSRF-Token on an unsafe method', async () => {
    document.cookie = 'csrf_token=nonce.mac; path=/'
    const requests = fakeServer(200)

    await api.post('/auth/login', {})

    expect(requests[0].headers.get('X-CSRF-Token')).toBe('nonce.mac')
  })

  it('sends no X-CSRF-Token on a GET', async () => {
    document.cookie = 'csrf_token=nonce.mac; path=/'
    const requests = fakeServer(200)

    await api.get('/auth/me')

    expect(requests[0].headers.has('X-CSRF-Token')).toBe(false)
  })

  it('bootstraps a csrf token before an unsafe request when none is set', async () => {
    let bootstrapped = false
    const requests: string[] = []
    api.defaults.adapter = async (config) => {
      requests.push(`${config.method} ${config.url}`)
      if (config.url === '/auth/csrf') {
        bootstrapped = true
        document.cookie = 'csrf_token=fresh.mac; path=/'
      }
      return { data: {}, status: 200, statusText: '', headers: {}, config }
    }

    await api.post('/auth/login', {})

    expect(bootstrapped).toBe(true)
    expect(requests).toEqual(['get /auth/csrf', 'post /auth/login'])
  })

  it('retries exactly once after a 403, then forwards the second failure', async () => {
    document.cookie = 'csrf_token=stale.mac; path=/'
    let calls = 0
    api.defaults.adapter = async (config) => {
      calls += 1
      if (config.url === '/auth/csrf') {
        document.cookie = 'csrf_token=fresh.mac; path=/'
        return { data: {}, status: 204, statusText: '', headers: {}, config }
      }
      const response = { data: {}, status: 403, statusText: '', headers: {}, config }
      throw new AxiosError('forbidden', AxiosError.ERR_BAD_REQUEST, config, null, response)
    }

    await expect(api.post('/auth/logout')).rejects.toMatchObject({
      response: { status: 403 },
    })
    // logout (403) -> csrf bootstrap -> logout retried (403 again, forwarded)
    // Exactly 3, not an unbounded loop: a 4th+ call would mean the
    // "already retried" flag didn't survive axios's config merge on retry.
    expect(calls).toBe(3)
  })
})
