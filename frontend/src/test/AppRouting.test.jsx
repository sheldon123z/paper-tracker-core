import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

const { mobileMode } = vi.hoisted(() => ({
  mobileMode: { value: false },
}))

vi.mock('../api', () => ({
  default: {
    post: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('../store', () => {
  const state = {
    darkMode: false,
    activeTabId: null,
    tabs: [],
    closeTab: vi.fn(),
    user: { id: 1, role: 'researcher', must_change_password: false },
    isAuthenticated: true,
    authPending: false,
    checkSession: vi.fn(),
    clearAuth: vi.fn(),
  }

  return {
    default: (selector) => (selector ? selector(state) : state),
  }
})

vi.mock('../hooks/useIsMobile', () => ({
  default: () => mobileMode.value,
}))

vi.mock('../components/copilot/CopilotProvider', () => ({
  default: ({ children }) => <>{children}</>,
}))

vi.mock('../components/chat/GlobalChatDrawer', () => ({
  default: ({ children }) => <>{children}</>,
}))

vi.mock('../components/layout/Sidebar', () => ({
  default: () => <aside>Sidebar</aside>,
}))

vi.mock('../components/layout/TabBar', () => ({
  default: () => null,
}))

vi.mock('../components/mobile/BottomNav', () => ({
  default: () => null,
}))

vi.mock('../components/mobile/MobileHeader', () => ({
  default: () => null,
}))

vi.mock('../components/paper/PaperTabView', () => ({
  default: () => null,
}))

vi.mock('../components/ui', () => ({
  ToastContainer: () => null,
}))

vi.mock('../pages/Dashboard', () => ({
  default: () => <div>Dashboard view</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderFeedsDeepLink() {
  return render(
    <MemoryRouter initialEntries={['/feeds']}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe.each([
  ['desktop', false],
  ['mobile', true],
])('%s application routing', (_label, isMobile) => {
  it('redirects the hidden RSS subscriptions route to the dashboard', async () => {
    mobileMode.value = isMobile
    renderFeedsDeepLink()

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(await screen.findByText('Dashboard view')).toBeInTheDocument()
    expect(screen.queryByText(/Feeds|订阅管理|RSS URL/i)).not.toBeInTheDocument()
  })
})
