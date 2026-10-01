import { renderHook } from '@testing-library/react'
import { usePageTitle } from './usePageTitle'

describe('usePageTitle', () => {
  it('sets the document title to the page name followed by the site name', () => {
    const { rerender } = renderHook(({ page }) => usePageTitle(page), {
      initialProps: { page: 'Login' },
    })
    expect(document.title).toBe('Login | Code Connect')

    rerender({ page: 'Cadastro' })
    expect(document.title).toBe('Cadastro | Code Connect')
  })
})
