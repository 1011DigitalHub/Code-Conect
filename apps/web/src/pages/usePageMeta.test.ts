import { renderHook } from '@testing-library/react'
import { usePageMeta } from './usePageMeta'

function metaDescription() {
  return document.querySelector('meta[name="description"]')?.getAttribute('content')
}

describe('usePageMeta', () => {
  it('sets the title and the meta description of the page', () => {
    const { rerender } = renderHook(({ page, description }) => usePageMeta(page, description), {
      initialProps: { page: 'Login', description: 'Descrição do login' },
    })
    expect(document.title).toBe('Login | Code Connect')
    expect(metaDescription()).toBe('Descrição do login')

    rerender({ page: 'Cadastro', description: 'Descrição do cadastro' })
    expect(document.title).toBe('Cadastro | Code Connect')
    expect(metaDescription()).toBe('Descrição do cadastro')
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  })
})
