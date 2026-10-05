import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { getErrorMessage, isUnauthorized } from './errors'

function apiError(status: number, headers: Record<string, string> = {}) {
  const config = { headers: new AxiosHeaders() }
  const response = { data: {}, status, statusText: '', headers, config } as AxiosResponse
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
}

describe('getErrorMessage', () => {
  it('maps each status to a message in Portuguese', () => {
    expect(getErrorMessage(apiError(400))).toBe('Verifique os dados informados.')
    expect(getErrorMessage(apiError(401))).toBe('Email ou senha inválidos.')
    expect(getErrorMessage(apiError(409))).toBe('Este email já está cadastrado.')
    expect(getErrorMessage(apiError(500))).toBe('Algo deu errado. Tente novamente.')
  })

  it('tells how long to wait on a 429 with Retry-After', () => {
    expect(getErrorMessage(apiError(429, { 'retry-after': '42' }))).toBe(
      'Muitas tentativas. Aguarde 42 segundos e tente novamente.',
    )
  })

  it('falls back to a minute on a 429 without Retry-After', () => {
    expect(getErrorMessage(apiError(429))).toBe(
      'Muitas tentativas. Aguarde um minuto e tente novamente.',
    )
  })

  it('reports a connection problem when there is no response', () => {
    const networkError = new AxiosError('Network Error', AxiosError.ERR_NETWORK)

    expect(getErrorMessage(networkError)).toBe(
      'Não foi possível conectar ao servidor. Tente novamente.',
    )
    expect(getErrorMessage(new Error('boom'))).toBe(
      'Não foi possível conectar ao servidor. Tente novamente.',
    )
  })
})

describe('isUnauthorized', () => {
  it('is true only for a 401 API error', () => {
    expect(isUnauthorized(apiError(401))).toBe(true)
    expect(isUnauthorized(apiError(500))).toBe(false)
    expect(isUnauthorized(new Error('boom'))).toBe(false)
  })
})
