import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock the api module
vi.mock('../api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
  },
}))

describe('Zustand Store', () => {
  let useStore

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    // Reset modules to get fresh store instance
    vi.resetModules()
    useStore = (await import('../store')).default
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initial State', () => {
    it('should have correct initial auth state', () => {
      const state = useStore.getState()

      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should have correct initial dark mode state', () => {
      const state = useStore.getState()

      expect(state.darkMode).toBe(false)
    })

    it('should have correct initial tab state', () => {
      const state = useStore.getState()

      expect(state.tabs).toEqual([])
      expect(state.activeTabId).toBeNull()
    })

    it('should have correct initial LLM catalog state', () => {
      const state = useStore.getState()

      expect(state.selectedModelId).toBeNull()
      expect(state.selectedModelMeta).toBeNull()
      expect(state.llmCatalog).toEqual([])
      expect(state.llmCatalogById).toEqual({})
      expect(state.llmCatalogLoaded).toBe(false)
    })

    it('should have correct initial workflow state', () => {
      const state = useStore.getState()

      expect(state.workflowSessionId).toBeNull()
      expect(state.workflowTemplateId).toBeNull()
      expect(state.workflowTemplateParams).toBeNull()
      expect(state.workflowStateSnapshot).toBeNull()
      expect(state.workflowConfigId).toBeNull()
    })

    it('should have correct initial PDF context state', () => {
      const state = useStore.getState()

      expect(state.pdfSelectedText).toBeNull()
      expect(state.pdfSelectedPage).toBeNull()
      expect(state.pdfActiveFileId).toBeNull()
      expect(state.pdfContextEnabled).toBe(false)
      expect(state.pdfContextLength).toBe(8000)
    })

    it('should have correct initial global chat state', () => {
      const state = useStore.getState()

      expect(state.globalChatOpen).toBe(false)
      expect(state.assistantPaperId).toBeNull()
      expect(state.paperAssistantSessionIds).toEqual({})
    })
  })

  describe('Auth Actions', () => {
    it('setAuth should update auth state and persist to localStorage', () => {
      const { setAuth } = useStore.getState()
      const user = { id: 1, email: 'test@example.com' }

      setAuth(user)

      const state = useStore.getState()
      expect(state.user).toEqual(user)
      expect(state.isAuthenticated).toBe(true)
      expect(JSON.parse(localStorage.getItem('auth_user'))).toEqual(user)
    })

    it('clearAuth should reset auth state and clear localStorage', () => {
      const { setAuth, clearAuth } = useStore.getState()
      const user = { id: 1, email: 'test@example.com' }

      setAuth(user)
      clearAuth()

      const state = useStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(localStorage.getItem('auth_user')).toBeNull()
    })

    it('setUser should update user and persist to localStorage', () => {
      const { setAuth, setUser } = useStore.getState()
      const user = { id: 1, email: 'test@example.com' }
      const updatedUser = { id: 1, email: 'updated@example.com', name: 'Test' }

      setAuth(user)
      setUser(updatedUser)

      const state = useStore.getState()
      expect(state.user).toEqual(updatedUser)
      expect(JSON.parse(localStorage.getItem('auth_user'))).toEqual(updatedUser)
    })
  })

  describe('Dark Mode Actions', () => {
    it('toggleDarkMode should toggle dark mode and persist to localStorage', () => {
      const { toggleDarkMode } = useStore.getState()

      expect(useStore.getState().darkMode).toBe(false)

      toggleDarkMode()
      expect(useStore.getState().darkMode).toBe(true)
      expect(localStorage.getItem('darkMode')).toBe('true')

      toggleDarkMode()
      expect(useStore.getState().darkMode).toBe(false)
      expect(localStorage.getItem('darkMode')).toBe('false')
    })
  })

  describe('Tab Actions', () => {
    it('openTab should add a new tab and set it as active', () => {
      const { openTab } = useStore.getState()
      const paper = { id: 1, title: 'Test Paper' }

      openTab(paper)

      const state = useStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0]).toMatchObject({ id: 1, title: 'Test Paper' })
      expect(state.activeTabId).toBe(1)
    })

    it('openTab should not duplicate existing tab', () => {
      const { openTab } = useStore.getState()
      const paper = { id: 1, title: 'Test Paper' }

      openTab(paper)
      openTab(paper)

      const state = useStore.getState()
      expect(state.tabs).toHaveLength(1)
    })

    it('openTab should update existing tab fileId when provided', () => {
      const { openTab } = useStore.getState()
      const paper = { id: 1, title: 'Test Paper' }

      openTab(paper)
      openTab(paper, { fileId: 'file-123' })

      const state = useStore.getState()
      expect(state.tabs[0]._initialFileId).toBe('file-123')
    })

    it('openTab should create a new request when reopening the same file', () => {
      const { openTab } = useStore.getState()
      const paper = { id: 1, title: 'Test Paper' }

      openTab(paper, { fileId: 'file-123' })
      const firstRequestId = useStore.getState().tabs[0]._fileOpenRequestId
      openTab(paper, { fileId: 'file-123' })
      const state = useStore.getState()

      expect(state.tabs[0]._initialFileId).toBe('file-123')
      expect(state.tabs[0]._fileOpenRequestId).toBeGreaterThan(firstRequestId)
    })

    it('closeTab should remove tab and update activeTabId', () => {
      const { openTab, closeTab } = useStore.getState()
      const paper1 = { id: 1, title: 'Paper 1' }
      const paper2 = { id: 2, title: 'Paper 2' }

      openTab(paper1)
      openTab(paper2)

      let state = useStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe(2)

      closeTab(2)
      state = useStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe(1)
    })

    it('closeTab should set activeTabId to last tab when closing active', () => {
      const { openTab, closeTab } = useStore.getState()
      const papers = [
        { id: 1, title: 'Paper 1' },
        { id: 2, title: 'Paper 2' },
        { id: 3, title: 'Paper 3' },
      ]

      papers.forEach((p) => openTab(p))
      closeTab(3)

      const state = useStore.getState()
      expect(state.activeTabId).toBe(2)
    })

    it('closeTab should set activeTabId to null when closing last tab', () => {
      const { openTab, closeTab } = useStore.getState()
      const paper = { id: 1, title: 'Paper 1' }

      openTab(paper)
      closeTab(1)

      const state = useStore.getState()
      expect(state.tabs).toHaveLength(0)
      expect(state.activeTabId).toBeNull()
    })

    it('setActiveTab should update activeTabId', () => {
      const { openTab, setActiveTab } = useStore.getState()
      const papers = [
        { id: 1, title: 'Paper 1' },
        { id: 2, title: 'Paper 2' },
      ]

      papers.forEach((p) => openTab(p))
      setActiveTab(1)

      expect(useStore.getState().activeTabId).toBe(1)
    })
  })

  describe('LLM Catalog Actions', () => {
    it('setSelectedModelId should update selected model ID', () => {
      const { setSelectedModelId } = useStore.getState()

      setSelectedModelId(42)

      expect(useStore.getState().selectedModelId).toBe(42)
    })

    it('setSelectedModelId should handle null/empty values', () => {
      const { setSelectedModelId } = useStore.getState()

      setSelectedModelId(null)
      expect(useStore.getState().selectedModelId).toBeNull()

      setSelectedModelId('')
      expect(useStore.getState().selectedModelId).toBeNull()

      setSelectedModelId(undefined)
      expect(useStore.getState().selectedModelId).toBeNull()
    })

    it('setLlmCatalog should update catalog and create byId map', () => {
      const { setLlmCatalog } = useStore.getState()
      const catalog = [
        { id: 1, name: 'Model 1', is_default: true },
        { id: 2, name: 'Model 2', is_default: false },
      ]

      setLlmCatalog(catalog)

      const state = useStore.getState()
      expect(state.llmCatalog).toHaveLength(2)
      expect(state.llmCatalogById[1]).toBeDefined()
      expect(state.llmCatalogById[2]).toBeDefined()
      expect(state.llmCatalogLoaded).toBe(true)
    })

    it('setLlmCatalog should select default model if no selection', () => {
      const { setLlmCatalog } = useStore.getState()
      const catalog = [
        { id: 1, name: 'Model 1', is_default: false },
        { id: 2, name: 'Model 2', is_default: true },
      ]

      setLlmCatalog(catalog)

      expect(useStore.getState().selectedModelId).toBe(2)
    })

    it('setLlmCatalog should select first model if no default', () => {
      const { setLlmCatalog } = useStore.getState()
      const catalog = [
        { id: 1, name: 'Model 1' },
        { id: 2, name: 'Model 2' },
      ]

      setLlmCatalog(catalog)

      expect(useStore.getState().selectedModelId).toBe(1)
    })

    it('setLlmCatalog should keep current selection if valid', () => {
      const { setLlmCatalog, setSelectedModelId } = useStore.getState()
      const catalog = [
        { id: 1, name: 'Model 1' },
        { id: 2, name: 'Model 2' },
        { id: 3, name: 'Model 3' },
      ]

      setLlmCatalog(catalog)
      setSelectedModelId(2)
      setLlmCatalog(catalog)

      expect(useStore.getState().selectedModelId).toBe(2)
    })

    it('setLlmCatalog should sort pinned models first', () => {
      const { setLlmCatalog } = useStore.getState()
      const catalog = [
        { id: 1, name: 'Model 1', is_pinned: false },
        { id: 2, name: 'Model 2', is_pinned: true },
        { id: 3, name: 'Model 3', is_pinned: false },
      ]

      setLlmCatalog(catalog)

      const state = useStore.getState()
      expect(state.llmCatalog[0].id).toBe(2)
    })

    it('setLlmCatalog should handle invalid catalog', () => {
      const { setLlmCatalog } = useStore.getState()

      setLlmCatalog(null)

      const state = useStore.getState()
      expect(state.llmCatalog).toEqual([])
      expect(state.llmCatalogById).toEqual({})
    })
  })

  describe('Workflow Actions', () => {
    it('setWorkflowSessionId should update session ID', () => {
      const { setWorkflowSessionId } = useStore.getState()

      setWorkflowSessionId('session-123')

      expect(useStore.getState().workflowSessionId).toBe('session-123')
    })

    it('setWorkflowTemplateId should update template ID', () => {
      const { setWorkflowTemplateId } = useStore.getState()

      setWorkflowTemplateId('template-456')

      expect(useStore.getState().workflowTemplateId).toBe('template-456')
    })

    it('setWorkflowTemplateParams should update params', () => {
      const { setWorkflowTemplateParams } = useStore.getState()
      const params = { query: 'test', limit: 10 }

      setWorkflowTemplateParams(params)

      expect(useStore.getState().workflowTemplateParams).toEqual(params)
    })

    it('setWorkflowStateSnapshot should update snapshot', () => {
      const { setWorkflowStateSnapshot } = useStore.getState()
      const snapshot = { step: 1, status: 'running' }

      setWorkflowStateSnapshot(snapshot)

      expect(useStore.getState().workflowStateSnapshot).toEqual(snapshot)
    })

    it('setWorkflowContext should update all workflow fields', () => {
      const { setWorkflowContext } = useStore.getState()
      const context = {
        sessionId: 'session-1',
        templateId: 'template-1',
        templateParams: { query: 'test' },
        stateSnapshot: { step: 1 },
        configId: 42,
      }

      setWorkflowContext(context)

      const state = useStore.getState()
      expect(state.workflowSessionId).toBe('session-1')
      expect(state.workflowTemplateId).toBe('template-1')
      expect(state.workflowTemplateParams).toEqual({ query: 'test' })
      expect(state.workflowStateSnapshot).toEqual({ step: 1 })
      expect(state.workflowConfigId).toBe(42)
    })

    it('clearWorkflowContext should reset all workflow fields', () => {
      const { setWorkflowContext, clearWorkflowContext } = useStore.getState()

      setWorkflowContext({
        sessionId: 'session-1',
        templateId: 'template-1',
        templateParams: { query: 'test' },
        stateSnapshot: { step: 1 },
        configId: 42,
      })
      clearWorkflowContext()

      const state = useStore.getState()
      expect(state.workflowSessionId).toBeNull()
      expect(state.workflowTemplateId).toBeNull()
      expect(state.workflowTemplateParams).toBeNull()
      expect(state.workflowStateSnapshot).toBeNull()
      expect(state.workflowConfigId).toBeNull()
    })
  })

  describe('PDF Context Actions', () => {
    it('setPdfSelection should update PDF selection', () => {
      const { setPdfSelection } = useStore.getState()

      setPdfSelection('selected text', 5)

      const state = useStore.getState()
      expect(state.pdfSelectedText).toBe('selected text')
      expect(state.pdfSelectedPage).toBe(5)
    })

    it('clearPdfSelection should clear PDF selection', () => {
      const { setPdfSelection, clearPdfSelection } = useStore.getState()

      setPdfSelection('text', 1)
      clearPdfSelection()

      const state = useStore.getState()
      expect(state.pdfSelectedText).toBeNull()
      expect(state.pdfSelectedPage).toBeNull()
    })

    it('setPdfActiveFileId should update active file ID', () => {
      const { setPdfActiveFileId } = useStore.getState()

      setPdfActiveFileId('file-789')

      expect(useStore.getState().pdfActiveFileId).toBe('file-789')
    })

    it('setPdfContextEnabled should update context enabled flag', () => {
      const { setPdfContextEnabled } = useStore.getState()

      setPdfContextEnabled(true)
      expect(useStore.getState().pdfContextEnabled).toBe(true)

      setPdfContextEnabled(false)
      expect(useStore.getState().pdfContextEnabled).toBe(false)
    })

    it('setPdfContextLength should update context length', () => {
      const { setPdfContextLength } = useStore.getState()

      setPdfContextLength(12000)

      expect(useStore.getState().pdfContextLength).toBe(12000)
    })
  })

  describe('Global Chat Actions', () => {
    it('toggleGlobalChat should toggle chat open state', () => {
      const { toggleGlobalChat } = useStore.getState()

      expect(useStore.getState().globalChatOpen).toBe(false)

      toggleGlobalChat()
      expect(useStore.getState().globalChatOpen).toBe(true)

      toggleGlobalChat()
      expect(useStore.getState().globalChatOpen).toBe(false)
    })
  })

  describe('Assistant Session', () => {
    it('setAssistantSessionId should update session ID', () => {
      const { setAssistantSessionId } = useStore.getState()

      setAssistantSessionId('assistant-session-1')

      expect(useStore.getState().assistantSessionId).toBe('assistant-session-1')
    })

    it('forced catalog refresh ignores an older in-flight response', async () => {
      const api = (await import('../api')).default
      let resolveOld
      let resolveFresh
      api.get
        .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFresh = resolve }))

      const firstRefresh = useStore.getState().refreshLlmCatalog()
      const forcedRefresh = useStore.getState().refreshLlmCatalog({ force: true })

      resolveFresh({ data: [{ id: 2, label: 'Fresh model', is_default: true }] })
      await forcedRefresh
      resolveOld({ data: [{ id: 1, label: 'Stale model', is_default: true }] })
      await firstRefresh

      expect(api.get).toHaveBeenCalledTimes(2)
      expect(useStore.getState().llmCatalog.map((item) => item.id)).toEqual([2])
    })

    it('keeps assistant selections isolated by paper ID', () => {
      const { setPaperAssistantSessionId } = useStore.getState()

      setPaperAssistantSessionId(61, 'ast-paper-a')
      setPaperAssistantSessionId(62, 'ast-paper-b')

      expect(useStore.getState().paperAssistantSessionIds).toEqual({
        61: 'ast-paper-a',
        62: 'ast-paper-b',
      })
    })
  })
})
