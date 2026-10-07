import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { api } from './client'
import { ensureCsrfToken, readCsrfCookie, resetCsrfToken } from './csrf'

function clearAllCookies() {
  for (const row of document.cookie.split(';')) {
    const name = row.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

// Stands in for the network: records the request and answers with a fixed status.
function fakeServer(status: number, setCookieHeader?: string) {
  const originalAdapter = api.defaults.adapter
  const requests: InternalAxiosRequestConfig[] = []
  api.defaults.adapter = async (config) => {
    requests.push(config)
    if (setCookieHeader) document.cookie = setCookieHeader
    const response = { data: {}, status, statusText: '', headers: {}, config }
    if (status >= 400) {
      throw new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
    }
    return response
  }
  return { requests, restore: () => (api.defaults.adapter = originalAdapter) }
}

describe('csrf', () => {
  afterEach(() => {
    clearAllCookies()
  })

  describe('readCsrfCookie', () => {
    it('is undefined when there is no csrf_token cookie', () => {
      expect(readCsrfCookie()).toBeUndefined()
    })

    it('reads the value when present', () => {
      document.cookie = 'csrf_token=nonce.mac; path=/'
      expect(readCsrfCookie()).toBe('nonce.mac')
    })

    it('finds it alongside other cookies', () => {
      document.cookie = 'other=1; path=/'
      document.cookie = 'csrf_token=nonce.mac; path=/'
      document.cookie = 'another=2; path=/'
      expect(readCsrfCookie()).toBe('nonce.mac')
    })

    it('percent-decodes the value', () => {
      document.cookie = `csrf_token=${encodeURIComponent('nonce/with.special')}; path=/`
      expect(readCsrfCookie()).toBe('nonce/with.special')
    })
  })

  describe('resetCsrfToken', () => {
    it('clears the cookie so readCsrfCookie no longer finds it', () => {
      document.cookie = 'csrf_token=nonce.mac; path=/'
      resetCsrfToken()
      expect(readCsrfCookie()).toBeUndefined()
    })
  })

  describe('ensureCsrfToken', () => {
    it('returns the existing cookie without a request when one is set', async () => {
      document.cookie = 'csrf_token=existing.mac; path=/'
      const { requests, restore } = fakeServer(204)
      try {
        await expect(ensureCsrfToken()).resolves.toBe('existing.mac')
        expect(requests).toHaveLength(0)
      } finally {
        restore()
      }
    })

    it('bootstraps via GET /auth/csrf when no cookie is set', async () => {
      const { requests, restore } = fakeServer(204, 'csrf_token=fresh.mac; path=/')
      try {
        await expect(ensureCsrfToken()).resolves.toBe('fresh.mac')
        expect(requests).toHaveLength(1)
        expect(requests[0]?.url).toBe('/auth/csrf')
      } finally {
        restore()
      }
    })

    it('memoizes concurrent callers into a single bootstrap request', async () => {
      const { requests, restore } = fakeServer(204, 'csrf_token=fresh.mac; path=/')
      try {
        const [first, second] = await Promise.all([ensureCsrfToken(), ensureCsrfToken()])
        expect(first).toBe('fresh.mac')
        expect(second).toBe('fresh.mac')
        expect(requests).toHaveLength(1)
      } finally {
        restore()
      }
    })
  })
})
