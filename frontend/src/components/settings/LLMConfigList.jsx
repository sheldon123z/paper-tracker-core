import { useState } from 'react'
import LLMConfigCard from './LLMConfigCard'

/* ── Search icon ── */
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

/**
 * Grouped & searchable config list.
 *
 * Owns local UI state: collapsedGroups, search clear.
 * Receives data & mutation callbacks from parent LLMSection.
 */
export default function LLMConfigList({
  // data
  groupedConfigs,
  configs,
  // search
  search,
  setSearch,
  // edit state (passed through to LLMConfigCard)
  editingId,
  form,
  setForm,
  selectedProvider,
  providerOptions,
  providerMap,
  onSubmit,
  onCancelEdit,
  submitting,
  formError,
  // test
  testResult,
  // selection
  selectionMode,
  selectedIds,
  toggleSelection,
  // card action callbacks (per-card)
  onEdit,
  onDelete,
  onTest,
  onSetDefault,
  onTogglePin,
  // UI toggles
  showAddForm,
}) {
  // Local UI state: which provider groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const toggleGroup = (key) => setCollapsedGroups((g) => ({ ...g, [key]: !g[key] }))

  const groupKeys = Object.keys(groupedConfigs)

  return (
    <>
      {/* Search bar */}
      {configs.length > 3 && (
        <div className="relative mb-3">
          <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }}>
            <SearchIcon />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型名称、Provider、地址..."
            className="w-full rounded-lg border py-2 pl-8 pr-3 text-sm outline-none transition-colors"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
              style={{ color: 'var(--text-secondary)', background: 'none', border: 'none' }}
            >
              &times;
            </button>
          )}
        </div>
      )}

      {/* Grouped config cards */}
      {groupKeys.length > 0 ? (
        <div className="space-y-3">
          {groupKeys.map((groupName) => {
            const items = groupedConfigs[groupName]
            const collapsed = collapsedGroups[groupName]
            return (
              <div key={groupName}>
                {/* Group header (only show when >1 group) */}
                {groupKeys.length > 1 && (
                  <button
                    onClick={() => toggleGroup(groupName)}
                    className="flex items-center gap-2 mb-2 w-full text-left cursor-pointer"
                    style={{ background: 'none', border: 'none', padding: 0 }}
                  >
                    <span
                      className="text-xs transition-transform duration-150"
                      style={{ color: 'var(--text-secondary)', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                    >
                      &#9660;
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {groupName}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                      ({items.length})
                    </span>
                  </button>
                )}
                {!collapsed && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {items.map((cfg) => (
                      <LLMConfigCard
                        key={cfg.id}
                        cfg={cfg}
                        isEditing={editingId === cfg.id}
                        form={form}
                        setForm={setForm}
                        selectedProvider={selectedProvider}
                        providerOptions={providerOptions}
                        providerMap={providerMap}
                        onSubmit={onSubmit}
                        onCancel={onCancelEdit}
                        submitting={submitting}
                        formError={formError}
                        testResult={testResult}
                        selectionMode={selectionMode}
                        isSelected={selectedIds.has(cfg.id)}
                        onEdit={() => onEdit(cfg)}
                        onDelete={() => onDelete(cfg.id)}
                        onTest={() => onTest(cfg.id)}
                        onSetDefault={() => onSetDefault(cfg)}
                        onTogglePin={() => onTogglePin(cfg)}
                        onToggleSelection={() => toggleSelection(cfg.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        !showAddForm && (
          <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            {search ? (
              <p className="text-sm">没有找到匹配的配置</p>
            ) : (
              <>
                <p className="text-sm">暂无 LLM 配置</p>
                <p className="text-xs mt-1">点击「+ 添加」创建你的第一个配置</p>
              </>
            )}
          </div>
        )
      )}
    </>
  )
}
