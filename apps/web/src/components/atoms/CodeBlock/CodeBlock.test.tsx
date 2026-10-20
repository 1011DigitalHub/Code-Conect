import { render, screen } from '@testing-library/react'
import { CodeBlock } from './CodeBlock'
import { expectNoA11yViolations } from '../../../test/axe'

describe('CodeBlock', () => {
  it('renders the code inside a pre/code element', () => {
    render(<CodeBlock code="const x = 1" />)

    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })

  it('renders markup as text, not HTML', () => {
    render(<CodeBlock code="<script>alert(1)</script>" />)

    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<CodeBlock code="const x = 1" />)

    await expectNoA11yViolations(container)
  })
})
