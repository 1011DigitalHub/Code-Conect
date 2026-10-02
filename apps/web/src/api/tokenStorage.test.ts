import { vi } from 'vitest'
import { clearToken, getToken, saveToken } from './tokenStorage'

describe('tokenStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    clearToken()
  })

  it('has no token at first', () => {
    expect(getToken()).toBeNull()
  })

  it('keeps the token in localStorage when "remember" is on', () => {
    saveToken('abc', true)

    expect(getToken()).toBe('abc')
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(0)
  })

  it('keeps the token in sessionStorage when "remember" is off', () => {
    saveToken('abc', false)

    expect(getToken()).toBe('abc')
    expect(sessionStorage.length).toBe(1)
    expect(localStorage.length).toBe(0)
  })

  it('moves the token when it is saved again with another choice', () => {
    saveToken('first', true)
    saveToken('second', false)

    expect(getToken()).toBe('second')
    expect(localStorage.length).toBe(0)
  })

  it('clears both storages', () => {
    saveToken('abc', true)
    clearToken()

    expect(getToken()).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('behaves as logged out when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => saveToken('abc', true)).not.toThrow()
    expect(getToken()).toBeNull()
    expect(() => clearToken()).not.toThrow()
  })
})
