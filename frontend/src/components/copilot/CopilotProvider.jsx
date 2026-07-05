import { useEffect, useMemo } from 'react'
import { CopilotKit } from '@copilotkit/react-core'
import useStore from '../../store'
import ToolCallRenderer from './ToolCallRenderer'

// Auto-detect CopilotRuntime URL based on current host
// 局域网/外网访问时自动替换 hostname，保持端口 4100。
// Keep the endpoint under /api so the backend's /api-scoped httpOnly auth
// cookies are sent to the runtime proxy as well.
const RUNTIME_URL = import.meta.env.VITE_COPILOT_RUNTIME_URL ||
  `${window.location.protocol}//${window.location.hostname}:4100/api/copilotkit`

/**
 * CopilotKit provider wrapper that passes dynamic properties to AG-UI agents.
 * The model catalog is preloaded here so the chat stack can render the current
 * model state even before the selector mounts.
 */
export default function CopilotProvider({ children }) {
  const activeTabId = useStore((state) => state.activeTabId)
  const selectedModelId = useStore((state) => state.selectedModelId)
  const selectedModelMeta = useStore((state) => state.selectedModelMeta)
  const llmCatalogLoaded = useStore((state) => state.llmCatalogLoaded)
  const refreshLlmCatalog = useStore((state) => state.refreshLlmCatalog)
  const assistantSessionId = useStore((state) => state.assistantSessionId)
  const catalogSessionId = useStore((state) => state.catalogSessionId)
  const workflowSessionId = useStore((state) => state.workflowSessionId)
  const workflowTemplateId = useStore((state) => state.workflowTemplateId)
  const workflowTemplateParams = useStore((state) => state.workflowTemplateParams)
  const workflowStateSnapshot = useStore((state) => state.workflowStateSnapshot)
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

  // Memoize properties to prevent re-creating the object on every render.
  // Without this, CopilotKit sees a new `properties` ref each render and
  // triggers downstream re-renders for all subscribed components (Issue #21).
  const properties = useMemo(() => ({
    configId: selectedModelId,
    paperId: activeTabId,
    assistantSessionId,
    catalogSessionId,
    workflowSessionId,
    templateId: workflowTemplateId,
    templateParams: workflowTemplateParams,
    workflowStateSnapshot,
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
    activeTabId,
    assistantSessionId,
    catalogSessionId,
    workflowSessionId,
    workflowTemplateId,
    workflowTemplateParams,
    workflowStateSnapshot,
    selectedModelMeta,
    pdfSelectedText,
    pdfSelectedPage,
    pdfActiveFileId,
    pdfContextEnabled,
    pdfContextLength,
  ])

  return (
    <CopilotKit
      runtimeUrl={RUNTIME_URL}
      agent="assistantAgent"
      showDevConsole={false}
      enableInspector={false}
      credentials="include"
      headers={copilotHeaders}
      properties={properties}
    >
      <ToolCallRenderer />
      {children}
    </CopilotKit>
  )
}
