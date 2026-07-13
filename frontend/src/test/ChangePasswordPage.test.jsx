import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ChangePasswordPage from '../pages/ChangePasswordPage'

const apiMock = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('../api', () => ({ default: apiMock }))
vi.mock('../store', () => ({
  default: () => ({
    user: { id: 1, must_change_password: true },
    setUser: vi.fn(),
    clearAuth: vi.fn(),
  }),
}))

describe('ChangePasswordPage password guidance', () => {
  it('shows the same missing password type guidance as account creation', () => {
    render(<MemoryRouter><ChangePasswordPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'lowercaseonly' } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      '还需从以下类型中至少选择 2 种：大写字母、数字、特殊字符',
    )
    expect(screen.getByLabelText('新密码')).toHaveAttribute('aria-invalid', 'true')
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('clears the guidance when the new password satisfies the shared rule', () => {
    render(<MemoryRouter><ChangePasswordPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: '中文测A1!' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('新密码')).toHaveAttribute('aria-invalid', 'false')
  })
})
