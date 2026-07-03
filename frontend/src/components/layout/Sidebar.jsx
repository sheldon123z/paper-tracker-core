import { NavLink, useNavigate } from 'react-router-dom'
import api from '../../api'
import useStore from '../../store'
import AppIcon from '../ui/AppIcon'

const navItems = [
  { path: '/', label: '仪表盘', icon: 'dashboard', description: '研究概览' },
  { path: '/feeds', label: '订阅源', icon: 'feeds', description: '采集通道' },
  { path: '/papers', label: '论文库', icon: 'papers', description: '文献总览' },
  { path: '/assistant', label: 'AI 助手', icon: 'assistant', description: '智能检索' },
  { path: '/workflow', label: '科研工作流', icon: 'workflow', description: '自动编排' },
  { path: '/tags', label: '标签', icon: 'tags', description: '知识标注' },
  { path: '/duplicates', label: '重复检测', icon: 'duplicates', description: '质量校验' },
  { path: '/settings', label: '设置', icon: 'settings', description: '系统配置' },
]

export default function Sidebar() {
  const { darkMode, toggleDarkMode, setActiveTab, user, clearAuth } = useStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      // refresh_token cookie is sent automatically via withCredentials
      await api.post('/api/auth/logout')
    } catch {
      // ignore logout errors
    }
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="mr-3 hidden h-[calc(100vh-24px)] w-[88px] shrink-0 md:flex md:w-[292px] md:flex-col">
      <div className="glass-panel glass-premium panel-outline flex h-full flex-col rounded-shell border border-glass px-4 py-4">
        <div className="mb-4 rounded-[24px] border border-glass bg-primary/40 px-4 py-4">
          <div className="panel-header-kicker mb-3 justify-center md:justify-start">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-accent/10 text-accent">
              <AppIcon name="workflow" size={16} />
            </span>
            <span className="hidden md:inline">Research Grid</span>
          </div>
          <h1 className="hidden font-display text-[22px] font-semibold text-primary md:block">Paper Tracker Core</h1>
          <p className="mt-2 hidden text-sm leading-6 text-secondary md:block">
            科研采集、AI 分析与工作流编排控制台
          </p>
        </div>

        <div className="mb-4 hidden px-2 md:block">
          <div className="panel-header-kicker">Core Modules</div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setActiveTab(null)}
              className={({ isActive }) =>
                [
                  'group relative flex items-center gap-3 rounded-[22px] border px-3 py-3 transition-all duration-200 cursor-pointer overflow-hidden',
                  isActive
                    ? 'glass-medium border-strong shadow-glass'
                    : 'border-transparent hover:border-glass hover:bg-primary/30',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-all duration-200',
                      isActive
                        ? 'border-accent/30 bg-accent/12 text-accent shadow-glass'
                        : 'border-glass bg-primary/20 text-secondary group-hover:text-primary',
                    ].join(' ')}
                  >
                    <AppIcon name={item.icon} size={18} />
                  </span>
                  <span className="hidden min-w-0 flex-1 md:block">
                    <span className={['block text-sm font-semibold', isActive ? 'text-primary' : 'text-secondary group-hover:text-primary'].join(' ')}>
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-tertiary">{item.description}</span>
                  </span>
                  <span
                    className={[
                      'h-2 w-2 rounded-full transition-all duration-200',
                      isActive ? 'bg-accent shadow-[0_0_14px_rgba(var(--accent-rgb),0.65)]' : 'bg-transparent group-hover:bg-accent/35',
                    ].join(' ')}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 rounded-[24px] border border-glass bg-primary/32 p-3">
          {user && (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-glass bg-primary/32 px-3 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 font-display text-sm font-semibold text-accent">
                {(user.display_name || user.username || '?')[0].toUpperCase()}
              </div>
              <div className="hidden min-w-0 flex-1 md:block">
                <div className="text-sm font-semibold text-primary truncate">{user.display_name || user.username}</div>
                <div className="text-xs text-tertiary truncate">{user.email || 'Authenticated Node'}</div>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass bg-primary/22 text-secondary transition-all hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
                title="登出"
              >
                <AppIcon name="logout" size={16} />
              </button>
            </div>
          )}

          <button
            onClick={toggleDarkMode}
            className="glass-subtle flex w-full items-center gap-3 rounded-2xl border border-glass px-3 py-3 text-left text-sm font-medium text-secondary transition-all duration-200 hover:border-strong hover:text-primary"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-glass bg-primary/20 text-accent">
              <AppIcon name={darkMode ? 'sun' : 'moon'} size={16} />
            </span>
            <span className="hidden flex-1 md:block">
              <span className="block font-semibold text-primary">{darkMode ? '浅色模式' : '深色模式'}</span>
              <span className="mt-0.5 block text-xs text-tertiary">切换研究控制台材质主题</span>
            </span>
          </button>
        </div>
      </div>
    </aside>
  )
}
