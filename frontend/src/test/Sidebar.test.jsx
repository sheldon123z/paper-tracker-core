import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../components/layout/Sidebar'

const setActiveTab = vi.fn()
const toggleDarkMode = vi.fn()
const clearAuth = vi.fn()

vi.mock('../api', () => ({
  default: { post: vi.fn(() => Promise.resolve()) },
}))

vi.mock('../store', () => ({
  default: () => ({
    darkMode: false,
    toggleDarkMode,
    setActiveTab,
    user: { username: 'researcher', email: 'researcher@example.com' },
    clearAuth,
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

  it('does not expose the RSS subscriptions entry', () => {
    renderSidebar()

    expect(screen.queryByRole('link', { name: /订阅源/ })).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/feeds"]')).not.toBeInTheDocument()
  })
})
