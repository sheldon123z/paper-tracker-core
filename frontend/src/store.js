import { create } from 'zustand'
import api from './api'
import { filterLlmConfigsForRuntime } from './config/runtime'

// Read darkMode initial value from localStorage
const initialDarkMode = (() => {
  try {
    const stored = localStorage.getItem('darkMode')
    if (stored !== null) return stored === 'true'
  } catch {
    // localStorage unavailable (e.g. SSR or private browsing restriction)
  }
  return false
})()

// Read cached user info from localStorage (validated against /api/auth/me on mount)
const initialUser = (() => {
  try {
    const raw = localStorage.getItem('auth_user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

// Restore paper tabs from localStorage so they survive page refresh
const _TABS_KEY = 'paper-tracker-tabs'
const _ACTIVE_TAB_KEY = 'paper-tracker-activeTab'

function _readTabs() {
  try {
    return JSON.parse(localStorage.getItem(_TABS_KEY) || '[]')
  } catch { return [] }
}
function _readActiveTab() {
  try {
    return JSON.parse(localStorage.getItem(_ACTIVE_TAB_KEY) || 'null')
  } catch { return null }
}
function _persistTabs(tabs, activeTabId) {
  try {
    localStorage.setItem(_TABS_KEY, JSON.stringify(tabs))
    localStorage.setItem(_ACTIVE_TAB_KEY, JSON.stringify(activeTabId))
  } catch { /* ignore */ }
}

let _llmCatalogRequest = null
let _llmCatalogRequestToken = 0
let _fileOpenRequestSequence = 0

const useStore = create((set, get) => ({
  // ---- Auth state ----
  // Tokens are now in httpOnly cookies — only user info is kept in state/localStorage.
  user: initialUser,
  isAuthenticated: !!initialUser,
  authPending: true, // true while session validation is in progress

  setAuth: (user) => {
    try {
      localStorage.setItem('auth_user', JSON.stringify(user))
    } catch { /* ignore */ }
    set({ user, isAuthenticated: true, authPending: false })
  },

  clearAuth: () => {
    try {
      localStorage.removeItem('auth_user')
    } catch { /* ignore */ }
    set({ user: null, isAuthenticated: false, authPending: false })
  },

  setUser: (user) => {
    try { localStorage.setItem('auth_user', JSON.stringify(user)) } catch { /* ignore */ }
    set({ user })
  },

  /**
   * Validate session on page load by calling /api/auth/me.
   * If the httpOnly cookie is valid, update user; otherwise clear auth.
   * Sets authPending to false when complete.
   */
  checkSession: async () => {
    try {
      const api = (await import('./api')).default
      const res = await api.get('/api/auth/me')
      set({ user: res.data, isAuthenticated: true, authPending: false })
      try { localStorage.setItem('auth_user', JSON.stringify(res.data)) } catch { /* ignore */ }
    } catch {
      set({ user: null, isAuthenticated: false, authPending: false })
      try { localStorage.removeItem('auth_user') } catch { /* ignore */ }
    }
  },

  // Paper tabs — persisted to localStorage
  tabs: _readTabs(),
  activeTabId: _readActiveTab(),

  openTab: (paper, options = {}) => {
    const { tabs } = get()
    const existingTab = tabs.find((t) => t.id === paper.id)
    const hasFileRequest = options.fileId !== undefined && options.fileId !== null
    const fileOpenRequestId = hasFileRequest ? ++_fileOpenRequestSequence : null
    let newTabs
    if (!existingTab) {
      newTabs = [...tabs, {
        ...paper,
        _initialFileId: hasFileRequest ? options.fileId : null,
        _fileOpenRequestId: fileOpenRequestId,
      }]
    } else if (hasFileRequest) {
      newTabs = tabs.map((t) => t.id === paper.id ? {
        ...t,
        _initialFileId: options.fileId,
        _fileOpenRequestId: fileOpenRequestId,
      } : t)
    } else {
      newTabs = tabs
    }
    _persistTabs(newTabs, paper.id)
    set({ tabs: newTabs, activeTabId: paper.id })
  },

  closeTab: (paperId) => {
    const { tabs, activeTabId } = get()
    const newTabs = tabs.filter((t) => t.id !== paperId)
    const newActive =
      activeTabId === paperId
        ? newTabs.length > 0
          ? newTabs[newTabs.length - 1].id
          : null
        : activeTabId
    _persistTabs(newTabs, newActive)
    set({ tabs: newTabs, activeTabId: newActive })
  },

  setActiveTab: (paperId) => {
    _persistTabs(get().tabs, paperId)
    set({ activeTabId: paperId })
  },

  // Dark mode — persisted to localStorage
  darkMode: initialDarkMode,
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode
      try {
        localStorage.setItem('darkMode', String(next))
      } catch {
        // ignore
      }
      return { darkMode: next }
    }),

  // Global selected LLM config ID (used by chat panels)
  selectedModelId: null,
  selectedModelMeta: null,
  llmCatalog: [],
  llmCatalogById: {},
  llmCatalogLoaded: false,

  setSelectedModelId: (id) =>
    set((state) => {
      const nextId = id === '' || id === null || id === undefined ? null : Number(id)
      const selectedModelId = Number.isFinite(nextId) ? nextId : null
      return {
        selectedModelId,
        selectedModelMeta: selectedModelId ? state.llmCatalogById[selectedModelId] || null : null,
      }
    }),

  setLlmCatalog: (catalog) =>
    set((state) => {
      const llmCatalog = Array.isArray(catalog)
        ? filterLlmConfigsForRuntime(catalog)
            .map((item) => ({
              ...item,
              id: Number(item.id),
            }))
            .filter((item) => Number.isFinite(item.id))
            .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
        : []
      const llmCatalogById = Object.fromEntries(llmCatalog.map((item) => [item.id, item]))
      const currentSelectedId = state.selectedModelId
      const fallbackId = llmCatalog.find((item) => item.is_default)?.id ?? llmCatalog[0]?.id ?? null
      const selectedModelId =
        currentSelectedId && llmCatalogById[currentSelectedId]
          ? currentSelectedId
          : fallbackId
      return {
        llmCatalog,
        llmCatalogById,
        llmCatalogLoaded: true,
        selectedModelId,
        selectedModelMeta: selectedModelId ? llmCatalogById[selectedModelId] || null : null,
      }
    }),

  refreshLlmCatalog: async (options = {}) => {
    const force = Boolean(options?.force)
    if (_llmCatalogRequest && !force) return _llmCatalogRequest

    const requestToken = ++_llmCatalogRequestToken
    const request = api.get('/api/llm-configs/brief').then((response) => {
      const catalog = response.data || []
      if (requestToken === _llmCatalogRequestToken) get().setLlmCatalog(catalog)
      return catalog
    })
    _llmCatalogRequest = request

    try {
      return await request
    } finally {
      if (_llmCatalogRequest === request) _llmCatalogRequest = null
    }
  },

  // Assistant session ID (forwarded to backend via CopilotKit properties)
  assistantSessionId: null,
  setAssistantSessionId: (id) => set({ assistantSessionId: id }),
  assistantPaperId: null,
  setAssistantPaperId: (paperId) => set({
    assistantPaperId:
      paperId !== null && paperId !== undefined && Number.isFinite(Number(paperId))
        ? Number(paperId)
        : null,
  }),
  clearAssistantPaperId: (paperId) => set((state) => (
    paperId === null
      || paperId === undefined
      || state.assistantPaperId === Number(paperId)
      ? { assistantPaperId: null }
      : {}
  )),
  paperAssistantSessionIds: {},
  setPaperAssistantSessionId: (paperId, sessionId) => set((state) => ({
    paperAssistantSessionIds: {
      ...state.paperAssistantSessionIds,
      [String(paperId)]: sessionId || null,
    },
  })),

  // Catalog session ID (forwarded to backend via CopilotKit properties).
  // Each paper detail panel gets a stable id (`cat-paper-{paperId}`) so
  // catalog chat history persists across reloads.
  catalogSessionId: null,
  setCatalogSessionId: (id) => set({ catalogSessionId: id || null }),

  // Workflow context (forwarded to backend via CopilotKit properties)
  workflowSessionId: null,
  workflowTemplateId: null,
  workflowTemplateParams: null,
  workflowStateSnapshot: null,
  workflowConfigId: null,
  setWorkflowSessionId: (id) => set({ workflowSessionId: id || null }),
  setWorkflowTemplateId: (id) => set({ workflowTemplateId: id || null }),
  setWorkflowTemplateParams: (params) => set({ workflowTemplateParams: params ?? null }),
  setWorkflowStateSnapshot: (snapshot) => set({ workflowStateSnapshot: snapshot ?? null }),
  setWorkflowContext: ({ sessionId, templateId, templateParams, stateSnapshot, configId } = {}) =>
    set({
      workflowSessionId: sessionId || null,
      workflowTemplateId: templateId || null,
      workflowTemplateParams: templateParams ?? null,
      workflowStateSnapshot: stateSnapshot ?? null,
      workflowConfigId:
        configId !== null && configId !== undefined && configId !== '' && Number.isFinite(Number(configId))
          ? Number(configId)
          : null,
    }),
  clearWorkflowContext: () =>
    set({
      workflowSessionId: null,
      workflowTemplateId: null,
      workflowTemplateParams: null,
      workflowStateSnapshot: null,
      workflowConfigId: null,
    }),

  // PDF reader context (forwarded to backend via CopilotKit properties)
  pdfSelectedText: null,
  pdfSelectedPage: null,
  pdfActiveFileId: null,
  pdfContextEnabled: false,   // user opt-in: inject full document context
  pdfContextLength: 8000,     // context truncation length (0 = unlimited)
  setPdfSelection: (text, page) => set({ pdfSelectedText: text || null, pdfSelectedPage: page || null }),
  clearPdfSelection: () => set({ pdfSelectedText: null, pdfSelectedPage: null }),
  setPdfActiveFileId: (id) => set({ pdfActiveFileId: id || null }),
  setPdfContextEnabled: (v) => set({ pdfContextEnabled: !!v }),
  setPdfContextLength: (n) => set({ pdfContextLength: n }),

  // Global chat
  globalChatOpen: false,
  toggleGlobalChat: () => set((s) => ({ globalChatOpen: !s.globalChatOpen })),
}))

// Note: Toast state is managed independently by useToastStore in
// frontend/src/components/ui/useToast.js — no conflict with this store.

export default useStore
