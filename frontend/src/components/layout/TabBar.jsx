import useStore from '../../store'
import AppIcon from '../ui/AppIcon'

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useStore()

  if (tabs.length === 0) return null

  return (
    <div className="glass-panel glass-medium panel-outline sticky top-0 z-20 mb-3 ml-0 mr-0 flex items-center gap-2 overflow-x-auto rounded-shell border border-glass px-3 py-2 shadow-glass">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`group flex min-w-[150px] max-w-[220px] cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3 py-2 transition-all duration-200 ${
            activeTabId === tab.id
              ? 'border-strong bg-accent/10 text-accent shadow-glass'
              : 'border-transparent text-secondary hover:border-glass hover:bg-primary/45 hover:text-primary'
          }`}
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-glass bg-primary/26 text-accent">
            <AppIcon name="papers" size={13} />
          </span>
          <span className="truncate text-xs font-medium flex-1">{tab.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            className="rounded-full p-1 opacity-0 transition-opacity bg-transparent hover:bg-primary/55 group-hover:opacity-100"
            aria-label="Close tab"
          >
            <AppIcon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
