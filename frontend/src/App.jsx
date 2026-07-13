import React, { Suspense, useEffect } from 'react'
import { Route, Routes, Navigate, useLocation } from 'react-router-dom'
import copilotKitV2Styles from '@copilotkit/react-core/v2/styles.css?raw'

import api from './api'
import CopilotProvider from './components/copilot/CopilotProvider'
import GlobalChatDrawer from './components/chat/GlobalChatDrawer'
import Sidebar from './components/layout/Sidebar'
import TabBar from './components/layout/TabBar'
import BottomNav from './components/mobile/BottomNav'
import MobileHeader from './components/mobile/MobileHeader'
import PaperTabView from './components/paper/PaperTabView'
import { ToastContainer } from './components/ui'
import LoginPage from './pages/LoginPage'
import useStore from './store'
import useIsMobile from './hooks/useIsMobile'

if (typeof document !== 'undefined' && !document.querySelector('style[data-copilotkit-v2-styles]')) {
  const stylesheet = document.createElement('style')
  stylesheet.textContent = `${copilotKitV2Styles}
    :root {
      --copilot-app-bg-primary: var(--bg-primary);
      --copilot-app-bg-secondary: var(--bg-secondary);
      --copilot-app-bg-tertiary: var(--bg-tertiary);
      --copilot-app-bg-elevated: var(--bg-elevated);
      --copilot-app-text-primary: var(--text-primary);
      --copilot-app-text-secondary: var(--text-secondary);
      --copilot-app-accent: var(--accent);
      --copilot-app-accent-light: var(--accent-light);
      --copilot-app-border: var(--border);
      --copilot-app-border-strong: var(--border-strong);
    }
    [data-copilotkit] {
      --background: var(--copilot-app-bg-primary);
      --foreground: var(--copilot-app-text-primary);
      --card: var(--copilot-app-bg-elevated);
      --card-foreground: var(--copilot-app-text-primary);
      --popover: var(--copilot-app-bg-elevated);
      --popover-foreground: var(--copilot-app-text-primary);
      --primary: var(--copilot-app-accent);
      --primary-foreground: #fff;
      --secondary: var(--copilot-app-bg-secondary);
      --secondary-foreground: var(--copilot-app-text-primary);
      --muted: var(--copilot-app-bg-tertiary);
      --muted-foreground: var(--copilot-app-text-secondary);
      --accent: var(--copilot-app-accent-light);
      --accent-foreground: var(--copilot-app-text-primary);
      --border: var(--copilot-app-border);
      --input: var(--copilot-app-border-strong);
      --ring: var(--copilot-app-accent);
    }
  `
  stylesheet.dataset.copilotkitV2Styles = 'true'
  document.head.appendChild(stylesheet)
}

const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const PapersPage = React.lazy(() => import('./pages/PapersPage'))
const FeedsPage = React.lazy(() => import('./pages/FeedsPage'))
const TagsPage = React.lazy(() => import('./pages/TagsPage'))
const DuplicatesPage = React.lazy(() => import('./pages/DuplicatesPage'))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'))
const AssistantPage = React.lazy(() => import('./pages/AssistantPage'))
const WorkflowPage = React.lazy(() => import('./pages/WorkflowPage'))
const AccessControlPage = React.lazy(() => import('./pages/AccessControlPage'))
const ChangePasswordPage = React.lazy(() => import('./pages/ChangePasswordPage'))

function ProtectedRoute({ children }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const authPending = useStore((s) => s.authPending)
  const user = useStore((s) => s.user)
  const location = useLocation()

  // While session validation is in progress, show loading to avoid flash redirect
  if (authPending) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-tertiary)' }}>
        验证会话中...
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return children
}

function ManagerRoute({ children }) {
  const user = useStore((s) => s.user)
  return user?.role === 'manager' ? children : <Navigate to="/" replace />
}

const SuspenseFallback = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-tertiary)' }}>
    加载中...
  </div>
)

export default function App() {
  const { darkMode, activeTabId, tabs, closeTab, user, isAuthenticated, checkSession, clearAuth, authPending } = useStore()
  const location = useLocation()
  const isMobile = useIsMobile()
  const userId = user?.id

  useEffect(() => {
    if (!isAuthenticated || user?.must_change_password || location.pathname === '/login') return undefined
    const record = (eventType) => {
      api.post('/api/activity', { event_type: eventType, path: location.pathname }).catch(() => {})
    }
    record('page_view')
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') record('heartbeat')
    }, 60000)
    return () => window.clearInterval(heartbeat)
  }, [isAuthenticated, location.pathname, user?.must_change_password])

  // Validate httpOnly cookie session on mount (replaces localStorage token check)
  useEffect(() => {
    if (location.pathname === '/login' && !userId) {
      clearAuth()
      return
    }
    checkSession()
  }, [checkSession, clearAuth, location.pathname, userId])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Login page renders completely outside the app shell
  if (location.pathname === '/login') {
    if (authPending) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-tertiary)' }}>
          验证会话中...
        </div>
      )
    }
    if (isAuthenticated) return <Navigate to={user?.must_change_password ? '/change-password' : '/'} replace />
    return <LoginPage />
  }

  if (location.pathname === '/change-password') {
    return (
      <ProtectedRoute>
        <div className={darkMode ? 'dark app-theme-root' : 'app-theme-root'}>
          <Suspense fallback={SuspenseFallback}><ChangePasswordPage /></Suspense>
        </div>
      </ProtectedRoute>
    )
  }

  const isFullPage = ['/assistant', '/workflow'].includes(location.pathname)
  // Hide CopilotSidebar when paper tab is active (has its own AI panel) or on full-page views
  const hideSidebar = !!activeTabId || isFullPage

  if (isMobile) {
    return (
      <ProtectedRoute>
        <div className={darkMode ? 'dark app-theme-root' : 'app-theme-root'}>
          <CopilotProvider>
            <ToastContainer />
            <div className="app-frame flex flex-col h-[100dvh]" style={{ color: 'var(--text-primary)' }}>
              <div className="flex-1 overflow-hidden relative">
                {/* 页面路由 - 始终渲染 */}
                <main className={`absolute inset-0 ${isFullPage ? 'overflow-hidden' : 'overflow-y-auto main-content-mobile'}`}>
                  <Suspense fallback={SuspenseFallback}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/feeds" element={<FeedsPage />} />
                      <Route path="/papers" element={<PapersPage />} />
                      <Route path="/tags" element={<TagsPage />} />
                      <Route path="/duplicates" element={<DuplicatesPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/assistant" element={<AssistantPage />} />
                      <Route path="/workflow" element={<WorkflowPage />} />
                      <Route path="/access-control" element={<ManagerRoute><AccessControlPage /></ManagerRoute>} />
                    </Routes>
                  </Suspense>
                </main>
                {/* 论文详情 - 覆盖在上面 */}
                {activeTabId && (
                  <div
                    className="absolute inset-0 z-10 flex flex-col"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                  >
                    <MobileHeader
                      title={activeTab?.title}
                      onBack={() => closeTab(activeTabId)}
                    />
                    <div className="flex-1 overflow-hidden">
                      <PaperTabView paperId={activeTabId} />
                    </div>
                  </div>
                )}
              </div>
              <BottomNav />
            </div>
          </CopilotProvider>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className={darkMode ? 'dark app-theme-root' : 'app-theme-root'}>
        <CopilotProvider>
          <ToastContainer />
          <GlobalChatDrawer hidden={hideSidebar}>
            <div
              className="app-frame flex overflow-hidden h-screen px-3 py-3 sm:px-4 sm:py-4"
              style={{ color: 'var(--text-primary)' }}
            >
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <TabBar />
                {activeTabId && <PaperTabView paperId={activeTabId} />}
                {isFullPage ? (
                  <main
                    className="app-content-scroll flex-1 overflow-hidden"
                    style={{ display: activeTabId ? 'none' : undefined }}
                  >
                    <Suspense fallback={SuspenseFallback}>
                      <Routes>
                        <Route path="/assistant" element={<AssistantPage />} />
                        <Route path="/workflow" element={<WorkflowPage />} />
                      </Routes>
                    </Suspense>
                  </main>
                ) : (
                  <main
                    className="app-content-scroll flex-1 overflow-y-auto px-3 pb-3 pt-1 sm:px-4 sm:pb-4"
                    style={{ display: activeTabId ? 'none' : undefined }}
                  >
                    <div className="mx-auto max-w-[1480px]">
                      <Suspense fallback={SuspenseFallback}>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/feeds" element={<FeedsPage />} />
                          <Route path="/papers" element={<PapersPage />} />
                          <Route path="/tags" element={<TagsPage />} />
                          <Route path="/duplicates" element={<DuplicatesPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="/access-control" element={<ManagerRoute><AccessControlPage /></ManagerRoute>} />
                        </Routes>
                      </Suspense>
                    </div>
                  </main>
                )}
              </div>
            </div>
          </GlobalChatDrawer>
        </CopilotProvider>
      </div>
    </ProtectedRoute>
  )
}
