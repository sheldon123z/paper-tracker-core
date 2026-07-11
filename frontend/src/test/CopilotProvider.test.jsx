import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  copilotProps: null,
  refreshLlmCatalog: vi.fn(),
}))

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: ({ children, ...props }) => {
    mocks.copilotProps = props
    return <div data-testid="copilot-provider">{children}</div>
  },
  defineToolCallRenderer: (renderer) => renderer,
}))

vi.mock('../store', () => {
  const state = {
    activeTabId: null,
    selectedModelId: 1,
    selectedModelMeta: null,
    llmCatalogLoaded: true,
    refreshLlmCatalog: mocks.refreshLlmCatalog,
    assistantSessionId: null,
    catalogSessionId: null,
    workflowSessionId: null,
    workflowTemplateId: null,
    workflowTemplateParams: null,
    workflowStateSnapshot: null,
    workflowConfigId: null,
    pdfSelectedText: null,
    pdfSelectedPage: null,
    pdfActiveFileId: null,
    pdfContextEnabled: false,
    pdfContextLength: 0,
  }

  return { default: (selector) => selector(state) }
})

import CopilotProvider from '../components/copilot/CopilotProvider'

describe('CopilotProvider production chrome', () => {
  it('disables both CopilotKit developer launchers', () => {
    render(
      <MemoryRouter>
        <CopilotProvider>
          <main>content</main>
        </CopilotProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('copilot-provider')).toBeInTheDocument()
    expect(mocks.copilotProps.showDevConsole).toBe(false)
    expect(mocks.copilotProps.enableInspector).toBe(false)
  })
})
