import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  setAuth: vi.fn(),
}))

vi.mock('../api', () => ({
  default: {
    get: (...args) => mocks.get(...args),
    post: (...args) => mocks.post(...args),
  },
}))

vi.mock('../store', () => ({
  default: (selector) => selector({ setAuth: mocks.setAuth }),
}))

import LoginForm from '../components/auth/LoginForm'

function renderLoginForm() {
  return render(
    <MemoryRouter>
      <LoginForm />
    </MemoryRouter>,
  )
}

describe('LoginForm runtime registration capability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows registration only when the backend enables it', async () => {
    mocks.get.mockResolvedValue({
      data: { public_registration_enabled: true },
    })

    renderLoginForm()

    expect(mocks.get).toHaveBeenCalledWith('/api/auth/capabilities')
    const registerToggle = await screen.findByRole('button', { name: '注册' })
    fireEvent.click(registerToggle)
    expect(screen.getByRole('button', { name: '创建账户' })).toBeInTheDocument()
  })

  it('fails closed when registration is disabled or capabilities cannot load', async () => {
    mocks.get.mockResolvedValueOnce({
      data: { public_registration_enabled: false },
    })
    const firstRender = renderLoginForm()

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: '注册' })).not.toBeInTheDocument()
    firstRender.unmount()

    mocks.get.mockRejectedValueOnce(new Error('backend unavailable'))
    renderLoginForm()

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: '注册' })).not.toBeInTheDocument()
  })
})
