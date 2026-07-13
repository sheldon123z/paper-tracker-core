import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AccessControlPage from '../pages/AccessControlPage'

const apiMock = vi.hoisted(() => ({ delete: vi.fn(), get: vi.fn(), post: vi.fn() }))

vi.mock('../api', () => ({ default: apiMock }))

describe('AccessControlPage account classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.delete.mockResolvedValue({ data: { message: 'Account deleted' } })
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

  it('shows session timestamps on two fixed lines and keeps long table values selectable', async () => {
    const deviceName = 'Mozilla/5.0 very-long-device-name-that-does-not-fit-in-the-table'
    const auditDeviceName = 'AuditAgent/1.0 another-very-long-device-name'
    const apiPath = '/api/papers/1234567890/attachments/very-long-resource-name'
    apiMock.get.mockImplementation((url) => {
      if (url === '/api/admin/departments') return Promise.resolve({ data: [] })
      if (url === '/api/admin/users') return Promise.resolve({ data: { items: [], meta: { total: 0, page: 1, size: 20 } } })
      if (url === '/api/admin/sessions') {
        return Promise.resolve({
          data: [{
            id: 1,
            email: 'user@example.com',
            ip_address: '127.0.0.1',
            user_agent: deviceName,
            created_at: '2026-07-13T04:05:06',
            expires_at: '2026-07-14T15:16:17',
            active: true,
          }],
        })
      }
      if (url === '/api/admin/audit') {
        return Promise.resolve({
          data: {
            items: [{ id: 1, created_at: '2026-07-13T04:05:06', actor_user_id: 1, department_id: 1, event_type: 'api.read', outcome: 'success', ip_address: '127.0.0.1', user_agent: auditDeviceName, method: 'GET', path: apiPath }],
            meta: { total: 1, page: 1, size: 100 },
          },
        })
      }
      if (url === '/api/admin/usage') return Promise.resolve({ data: [] })
      throw new Error(`Unexpected URL: ${url}`)
    })

    render(<AccessControlPage />)
    fireEvent.click(await screen.findByRole('tab', { name: '在线会话' }))

    expect(await screen.findByText('2026-07-13')).toBeInTheDocument()
    expect(screen.getByText('04:05:06')).toBeInTheDocument()
    expect(screen.getByText('2026-07-14')).toBeInTheDocument()
    expect(screen.getByText('15:16:17')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument()
    expect(screen.getByTitle(deviceName)).toHaveClass('select-text', 'overflow-x-auto')
    expect(screen.getByRole('button', { name: '强制下线' })).toHaveClass('whitespace-nowrap')

    fireEvent.click(screen.getByRole('tab', { name: '登录与操作审计' }))
    expect(await screen.findByTitle(auditDeviceName)).toHaveClass('select-text', 'overflow-x-auto')
    expect(screen.getByTitle(`GET ${apiPath}`)).toHaveClass('select-text', 'overflow-x-auto')
  })

  it('shows only administrator and department account types', async () => {
    render(<AccessControlPage />)

    fireEvent.click(await screen.findByRole('tab', { name: '账号' }))

    expect(await screen.findByText('管理员账号')).toBeInTheDocument()
    expect(screen.getByText('A部门账号')).toBeInTheDocument()
    expect(screen.queryByText('使用等级')).not.toBeInTheDocument()
    expect(screen.queryByText(/A 级|B 级/)).not.toBeInTheDocument()
  })

  it('replaces all-session logout with confirmed account deletion', async () => {
    render(<AccessControlPage />)
    fireEvent.click(await screen.findByRole('tab', { name: '账号' }))

    expect(screen.queryByRole('button', { name: '全部下线' })).not.toBeInTheDocument()
    const deleteButtons = await screen.findAllByRole('button', { name: '注销账号' })
    fireEvent.click(deleteButtons[1])

    expect(screen.getByRole('dialog')).toHaveTextContent('注销 a@example.com')
    expect(screen.getByRole('dialog')).toHaveTextContent('此操作不可撤销')
    fireEvent.click(screen.getByRole('button', { name: '确认注销' }))

    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/api/admin/users/2'))
  })

  it('names missing password character types and requires a department', async () => {
    render(<AccessControlPage />)
    fireEvent.click(await screen.findByRole('tab', { name: '账号' }))

    fireEvent.change(screen.getByLabelText('临时密码'), { target: { value: 'lowercaseonly' } })
    expect(screen.getByRole('alert')).toHaveTextContent('还需从以下类型中至少选择 2 种：大写字母、数字、特殊字符')

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'new_user' } })
    fireEvent.change(screen.getByLabelText('临时密码'), { target: { value: '中文测A1!' } })
    expect(screen.queryByText(/长度还差|长度超过上限|还需从以下类型/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }))

    expect(await screen.findByText('创建部门账号时必须选择一个具体部门')).toBeInTheDocument()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '所属部门（必选）' })).toHaveAttribute('aria-required', 'true')
  })

  it('shows Chinese inline errors for short username and display name', async () => {
    render(<AccessControlPage />)
    fireEvent.click(await screen.findByRole('tab', { name: '账号' }))

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'ab' } })
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '名' } })

    const errors = screen.getAllByText('至少包含三个字符')
    expect(errors).toHaveLength(2)
    expect(screen.getByLabelText('用户名')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('显示名称')).toHaveAttribute('aria-invalid', 'true')
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})
