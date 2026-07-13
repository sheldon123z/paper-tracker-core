import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AccessControlPage from '../pages/AccessControlPage'

const apiMock = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../api', () => ({ default: apiMock }))

describe('AccessControlPage account classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockImplementation((url) => {
      if (url === '/api/admin/departments') {
        return Promise.resolve({ data: [{ id: 1, code: 'A', name: 'A部门', status: 'active' }] })
      }
      if (url === '/api/admin/users') {
        return Promise.resolve({
          data: {
            items: [
              { id: 1, email: 'manager@example.com', username: 'manager', role: 'manager', status: 'active', department_name: null },
              { id: 2, email: 'a@example.com', username: 'dept_a', role: 'user', status: 'active', department_name: 'A部门' },
            ],
            meta: { total: 2, page: 1, size: 20 },
          },
        })
      }
      if (url === '/api/admin/sessions') return Promise.resolve({ data: [] })
      if (url === '/api/admin/audit') return Promise.resolve({ data: { items: [], meta: { total: 0, page: 1, size: 100 } } })
      if (url === '/api/admin/usage') return Promise.resolve({ data: [] })
      throw new Error(`Unexpected URL: ${url}`)
    })
  })

  it('shows only administrator and department account types', async () => {
    render(<AccessControlPage />)

    fireEvent.click(await screen.findByRole('tab', { name: '账号' }))

    expect(await screen.findByText('管理员账号')).toBeInTheDocument()
    expect(screen.getByText('A部门账号')).toBeInTheDocument()
    expect(screen.queryByText('使用等级')).not.toBeInTheDocument()
    expect(screen.queryByText(/A 级|B 级/)).not.toBeInTheDocument()
  })
})
