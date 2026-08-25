import { useEffect, useMemo } from 'react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { useLocation } from 'react-router-dom'
import useStore from '../../store'
import { COPILOT_RUNTIME_URL } from '../../config/runtime'
import { TOOL_CALL_RENDERERS } from './ToolCallRenderer'

/**
 * CopilotKit provider wrapper that passes dynamic properties to AG-UI agents.
 * The model catalog is preloaded here so the chat stack can render the current
 * model state even before the selector mounts.
 */
export default function CopilotProvider({ children }) {
  const { pathname } = useLocation()
  const activeTabId = useStore((state) => state.activeTabId)
  const selectedModelId = useStore((state) => state.selectedModelId)
  const selectedModelMeta = useStore((state) => state.selectedModelMeta)
  const llmCatalogLoaded = useStore((state) => state.llmCatalogLoaded)
  const refreshLlmCatalog = useStore((state) => state.refreshLlmCatalog)
  const assistantSessionId = useStore((state) => state.assistantSessionId)
  const assistantPaperId = useStore((state) => state.assistantPaperId)
  const globalChatOpen = useStore((state) => state.globalChatOpen)
  const catalogSessionId = useStore((state) => state.catalogSessionId)
  const workflowSessionId = useStore((state) => state.workflowSessionId)
  const workflowTemplateId = useStore((state) => state.workflowTemplateId)
  const workflowTemplateParams = useStore((state) => state.workflowTemplateParams)
  const workflowStateSnapshot = useStore((state) => state.workflowStateSnapshot)
  const workflowConfigId = useStore((state) => state.workflowConfigId)
  const pdfSelectedText = useStore((state) => state.pdfSelectedText)
  const pdfSelectedPage = useStore((state) => state.pdfSelectedPage)
  const pdfActiveFileId = useStore((state) => state.pdfActiveFileId)
  const pdfContextEnabled = useStore((state) => state.pdfContextEnabled)
  const pdfContextLength = useStore((state) => state.pdfContextLength)

  useEffect(() => {
    if (llmCatalogLoaded) return
    refreshLlmCatalog().catch(() => {})
  }, [llmCatalogLoaded, refreshLlmCatalog])

  // Shared-secret header for CopilotRuntime auth (optional)
  const copilotHeaders = useMemo(() => {
    const secret = import.meta.env.VITE_COPILOT_RUNTIME_SECRET?.trim()
    return secret ? { 'X-Copilot-Secret': secret } : {}
  }, [])

  const assistantSurface = useMemo(() => {
    // Explicit global surfaces take precedence over any persisted or mounted
    // paper context, so their requests can never inherit a stale paper id.
    if (pathname === '/assistant' || globalChatOpen) {
      return { scope: 'global', paperId: null }
    }
    if (assistantPaperId !== null && assistantPaperId !== undefined) {
      return { scope: 'paper', paperId: assistantPaperId }
    }
    // Preserve paper context for other paper agents during the first render,
    // before AIChatPanel has registered its concrete paper id.
    if (activeTabId !== null && activeTabId !== undefined) {
      return { scope: 'paper', paperId: activeTabId }
    }
    return { scope: 'global', paperId: null }
  }, [activeTabId, assistantPaperId, globalChatOpen, pathname])

  // Memoize properties to prevent re-creating the object on every render.
  // Without this, CopilotKit sees a new `properties` ref each render and
  // triggers downstream re-renders for all subscribed components (Issue #21).
  const properties = useMemo(() => ({
    configId: pathname === '/workflow' && workflowConfigId ? workflowConfigId : selectedModelId,
    paperId: assistantSurface.paperId,
    assistantScope: assistantSurface.scope,
    assistantSessionId,
    catalogSessionId,
    workflowSessionId,
    templateId: workflowTemplateId,
    templateParams: workflowTemplateParams,
    workflowStateSnapshot,
    workflowConfigId,
    llmProviderKey: selectedModelMeta?.provider || null,
    llmProviderLabel: selectedModelMeta?.provider_label || null,
    llmHealthStatus: selectedModelMeta?.health_status || null,
    llmIsLocal: selectedModelMeta?.is_local || false,
    llmSupportsToolCalling: selectedModelMeta?.supports_tool_calling || false,
    llmSupportsReasoning: selectedModelMeta?.supports_reasoning || false,
    pdfSelectedText,
    pdfSelectedPage,
    pdfActiveFileId,
    pdfContextEnabled,
    pdfContextLength,
  }), [
    selectedModelId,
    assistantSurface,
    assistantSessionId,
    catalogSessionId,
    workflowSessionId,
    workflowTemplateId,
    workflowTemplateParams,
    workflowStateSnapshot,
    workflowConfigId,
    pathname,
    selectedModelMeta,
    pdfSelectedText,
    pdfSelectedPage,
    pdfActiveFileId,
    pdfContextEnabled,
    pdfContextLength,
  ])

  return (
    <CopilotKit
      runtimeUrl={COPILOT_RUNTIME_URL}
      showDevConsole={false}
      enableInspector={false}
      credentials="include"
      headers={copilotHeaders}
      properties={properties}
      renderToolCalls={TOOL_CALL_RENDERERS}
    >
      {children}
    </CopilotKit>
  )
}
