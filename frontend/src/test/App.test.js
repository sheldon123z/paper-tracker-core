import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

// Mock dependencies before importing App
vi.mock('../store', () => ({
  default: (selector) => {
    const state = {
      darkMode: false,
      activeTabId: null,
      tabs: [],
      closeTab: vi.fn(),
      isAuthenticated: true,
      authPending: false,
      checkSession: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('../hooks/useIsMobile', () => ({
  default: () => false,
}))

vi.mock('../components/copilot/CopilotProvider', () => ({
  default: ({ children }) => React.createElement('div', { 'data-testid': 'copilot-provider' }, children),
}))

vi.mock('../components/chat/GlobalChatDrawer', () => ({
  default: ({ children }) => React.createElement('div', { 'data-testid': 'global-chat-drawer' }, children),
}))

vi.mock('../components/layout/Sidebar', () => ({
  default: () => React.createElement('div', { 'data-testid': 'sidebar' }),
}))

vi.mock('../components/layout/TabBar', () => ({
  default: () => React.createElement('div', { 'data-testid': 'tabbar' }),
}))

vi.mock('../components/mobile/BottomNav', () => ({
  default: () => React.createElement('div', { 'data-testid': 'bottom-nav' }),
}))

vi.mock('../components/mobile/MobileHeader', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mobile-header' }),
}))

vi.mock('../components/paper/PaperTabView', () => ({
  default: () => React.createElement('div', { 'data-testid': 'paper-tab-view' }),
}))

vi.mock('../components/ui', () => ({
  ToastContainer: () => React.createElement('div', { 'data-testid': 'toast-container' }),
}))

// Mock react-router-dom
const mockUseLocation = vi.fn()
vi.mock('react-router-dom', () => ({
  Route: ({ element }) => element,
  Routes: ({ children }) => React.createElement('div', { 'data-testid': 'routes' }, children),
  useLocation: () => mockUseLocation(),
  Navigate: () => React.createElement('div', { 'data-testid': 'navigate' }),
}))

// Mock lazy-loaded pages
vi.mock('../pages/Dashboard', () => ({
  default: () => React.createElement('div', { 'data-testid': 'dashboard' }, 'Dashboard'),
}))
vi.mock('../pages/PapersPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'papers' }, 'Papers'),
}))
vi.mock('../pages/FeedsPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'feeds' }, 'Feeds'),
}))
vi.mock('../pages/TagsPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'tags' }, 'Tags'),
}))
vi.mock('../pages/DuplicatesPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'duplicates' }, 'Duplicates'),
}))
vi.mock('../pages/SettingsPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'settings' }, 'Settings'),
}))
vi.mock('../pages/AssistantPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'assistant' }, 'Assistant'),
}))
vi.mock('../pages/WorkflowPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'workflow' }, 'Workflow'),
}))
vi.mock('../pages/LoginPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'login' }, 'Login'),
}))

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLocation.mockReturnValue({ pathname: '/' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render without crashing', async () => {
    // Reset modules to get fresh imports with mocks applied
    vi.resetModules()

    // Re-import after resetting modules
    const { default: App } = await import('../App')

    const { container } = require('@testing-library/react').render(React.createElement(App))

    expect(container).toBeDefined()
  })

  it('should render login page when on /login path and not authenticated', async () => {
    vi.resetModules()

    // Mock unauthenticated state for login page
    vi.doMock('../store', () => ({
      default: (selector) => {
        const state = {
          darkMode: false,
          activeTabId: null,
          tabs: [],
          closeTab: vi.fn(),
          isAuthenticated: false,
          authPending: false,
          checkSession: vi.fn(),
        }
        return selector ? selector(state) : state
      },
    }))

    mockUseLocation.mockReturnValue({ pathname: '/login' })

    const { default: App } = await import('../App')
    const { screen } = require('@testing-library/react')

    require('@testing-library/react').render(React.createElement(App))

    expect(screen.getByTestId('login')).toBeDefined()
  })

  it('should include CopilotProvider', async () => {
    vi.resetModules()

    const { default: App } = await import('../App')
    const { screen } = require('@testing-library/react')

    require('@testing-library/react').render(React.createElement(App))

    expect(screen.getByTestId('copilot-provider')).toBeDefined()
  })

  it('should include ToastContainer', async () => {
    vi.resetModules()

    const { default: App } = await import('../App')
    const { screen } = require('@testing-library/react')

    require('@testing-library/react').render(React.createElement(App))

    expect(screen.getByTestId('toast-container')).toBeDefined()
  })

  it('should include Sidebar on desktop', async () => {
    vi.resetModules()

    const { default: App } = await import('../App')
    const { screen } = require('@testing-library/react')

    require('@testing-library/react').render(React.createElement(App))

    expect(screen.getByTestId('sidebar')).toBeDefined()
  })

  it('should include TabBar on desktop', async () => {
    vi.resetModules()

    const { default: App } = await import('../App')
    const { screen } = require('@testing-library/react')

    require('@testing-library/react').render(React.createElement(App))

    expect(screen.getByTestId('tabbar')).toBeDefined()
  })
})
