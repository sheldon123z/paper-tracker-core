import { useState } from 'react'
import useIsMobile from '../hooks/useIsMobile'
import LLMSection from '../components/settings/LLMSection'
import SkillsSection from '../components/settings/SkillsSection'
import SystemPromptsSection from '../components/settings/SystemPromptsSection'
import TemplatesSection from '../components/settings/TemplatesSection'
import MonitorSection from '../components/settings/MonitorSection'
import { RUNTIME_CAPABILITIES } from '../config/runtime'

const IconCpu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
  </svg>
)

const IconWrench = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)

const IconFileText = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)

const IconTerminal = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,17 10,11 4,5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

const IconChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)

const TABS = [
  { key: 'llm', label: 'LLM 模型', icon: IconCpu },
  { key: 'monitor', label: 'LLM 监控', icon: IconChart },
  { key: 'skills', label: 'Agent 技能', icon: IconWrench },
  { key: 'templates', label: 'Prompt 模板', icon: IconFileText },
  { key: 'system', label: '系统提示词', icon: IconTerminal },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('llm')
  const isMobile = useIsMobile()

  return (
    <div
      className="p-4 lg:p-6 max-w-6xl"
      style={isMobile ? { paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' } : undefined}
    >
      <div className="mb-5">
        {!isMobile && (
          <div className="panel-header-kicker mb-2">System Control</div>
        )}
        <h1
          className={`section-title font-bold${isMobile ? ' text-lg' : ' text-xl'}`}
          style={{ color: 'var(--text-primary)' }}
        >
          设置
        </h1>
        {RUNTIME_CAPABILITIES.offlineMode && (
          <div
            role="status"
            data-testid="offline-mode-notice"
            className="mt-3 flex max-w-2xl items-start gap-2 rounded-xl border px-3 py-2 text-xs"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>离线模式</span>
            <span>仅显示并使用本地模型；云端文档解析已关闭。</span>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* ── Desktop sidebar nav ── */}
        <nav className="hidden lg:block shrink-0 w-48">
          <div className="glass-panel glass-medium panel-outline sticky top-4 space-y-1 rounded-shell border border-glass p-3">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-2xl text-sm font-medium text-left transition-all duration-150 cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--accent-light)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  }}
                >
                  <Icon />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* ── Mobile horizontal tabs ── */}
        <nav className="flex lg:hidden gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 shrink-0 cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: active ? 'none' : '1px solid var(--border)',
                }}
              >
                <Icon />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* ── Content ── */}
        <main className="flex-1 min-w-0">
          {activeTab === 'llm' && <LLMSection />}
          {activeTab === 'monitor' && <MonitorSection />}
          {activeTab === 'skills' && <SkillsSection />}
          {activeTab === 'templates' && <TemplatesSection />}
          {activeTab === 'system' && <SystemPromptsSection />}
        </main>
      </div>
    </div>
  )
}
