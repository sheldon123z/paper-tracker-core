import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../components/layout/Sidebar'

const mocks = vi.hoisted(() => ({
  setActiveTab: vi.fn(),
  toggleDarkMode: vi.fn(),
  clearAuth: vi.fn(),
  user: null,
}))

vi.mock('../api', () => ({
  default: { post: vi.fn(() => Promise.resolve()) },
}))

vi.mock('../store', () => ({
  default: () => ({
    darkMode: false,
    toggleDarkMode: mocks.toggleDarkMode,
    setActiveTab: mocks.setActiveTab,
    user: mocks.user,
    clearAuth: mocks.clearAuth,
  }),
}))

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = {
      username: 'researcher',
      email: 'researcher@example.com',
      role: 'user',
      department_id: null,
      department_name: null,
    }
  })

  it('keeps an accessible switch available while collapsing and reopening the sidebar', async () => {
    const user = userEvent.setup()
    renderSidebar()

    const sidebar = screen.getByRole('complementary', { name: '主导航侧边栏' })
    const closeSwitch = screen.getByRole('button', { name: '收起左侧边栏' })
    const sidebarContent = document.getElementById('primary-sidebar-content')

    expect(sidebar).toHaveAttribute('data-state', 'open')
    expect(sidebar).toHaveClass('w-[292px]')
    expect(closeSwitch).toHaveAttribute('aria-expanded', 'true')
    expect(closeSwitch).toHaveAttribute('aria-controls', sidebarContent.id)
    expect(closeSwitch.parentElement).toHaveClass('justify-end')
    expect(sidebarContent).not.toHaveAttribute('hidden')

    await user.click(closeSwitch)

    const openSwitch = screen.getByRole('button', { name: '展开左侧边栏' })
    expect(sidebar).toHaveAttribute('data-state', 'closed')
    expect(sidebar).toHaveClass('w-[64px]')
    expect(openSwitch).toHaveAttribute('aria-expanded', 'false')
    expect(openSwitch.parentElement).toHaveClass('justify-center')
    expect(document.getElementById('primary-sidebar-content')).toBe(sidebarContent)
    expect(sidebarContent).toHaveAttribute('hidden')

    await user.click(openSwitch)

    expect(sidebar).toHaveClass('w-[292px]')
    const reopenedSwitch = screen.getByRole('button', { name: '收起左侧边栏' })
    expect(reopenedSwitch).toHaveAttribute('aria-expanded', 'true')
    expect(reopenedSwitch.parentElement).toHaveClass('justify-end')
    expect(sidebarContent).not.toHaveAttribute('hidden')
  })

  it('exposes the RSS subscriptions entry', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /RSS 订阅源/ })).toBeInTheDocument()
    expect(document.querySelector('a[href="/feeds"]')).toBeInTheDocument()
  })

  it('shows the department name badge for a department account', () => {
    mocks.user = {
      username: 'researcher',
      email: 'researcher@example.com',
      role: 'user',
      department_id: 7,
      department_name: '先进制造研究部',
    }

    renderSidebar()

    const badge = screen.getByText('先进制造研究部')
    expect(badge).toHaveAttribute('title', '先进制造研究部')
    expect(badge).toHaveClass('truncate')
    expect(screen.queryByText('管理员')).not.toBeInTheDocument()
  })

  it('shows an administrator badge for a manager account', () => {
    mocks.user = {
      username: 'manager',
      email: 'manager@example.com',
      role: 'manager',
      department_id: null,
      department_name: null,
    }

    renderSidebar()

    expect(screen.getByText('管理员')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /权限管理/ })).toBeInTheDocument()
  })
})
