import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { api } from './client'
import { clearToken, getToken, saveToken } from './tokenStorage'

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

describe('api client', () => {
  afterEach(() => {
    api.defaults.adapter = originalAdapter
    clearToken()
  })

  it('sends the Bearer token when there is one', async () => {
    saveToken('abc', false)
    const requests = fakeServer(200)

    await api.get('/auth/me')

    expect(requests[0].headers.get('Authorization')).toBe('Bearer abc')
  })

  it('sends no Authorization header without a token', async () => {
    const requests = fakeServer(200)

    await api.post('/auth/login', {})

    expect(requests[0].headers.has('Authorization')).toBe(false)
  })

  it('forgets the token on a 401 for a request that carried it', async () => {
    saveToken('expired', true)
    fakeServer(401)

    await expect(api.get('/auth/me')).rejects.toMatchObject({ response: { status: 401 } })

    expect(getToken()).toBeNull()
  })

  it('keeps the token on other errors', async () => {
    saveToken('abc', true)
    fakeServer(500)

    await expect(api.get('/auth/me')).rejects.toBeDefined()

    expect(getToken()).toBe('abc')
  })
})
