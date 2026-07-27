import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const refreshLlmCatalog = vi.fn()
  return {
    copilotProps: null,
    refreshLlmCatalog,
    storeState: {
      activeTabId: null,
      assistantPaperId: null,
      globalChatOpen: false,
      selectedModelId: 1,
      selectedModelMeta: null,
      llmCatalogLoaded: true,
      refreshLlmCatalog,
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
    },
  }
})

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: ({ children, ...props }) => {
    mocks.copilotProps = props
    return <div data-testid="copilot-provider">{children}</div>
  },
  defineToolCallRenderer: (renderer) => renderer,
}))

vi.mock('../store', () => {
  return { default: (selector) => selector(mocks.storeState) }
})

import CopilotProvider from '../components/copilot/CopilotProvider'

describe('CopilotProvider production chrome', () => {
  beforeEach(() => {
    mocks.copilotProps = null
    Object.assign(mocks.storeState, {
      activeTabId: null,
      assistantPaperId: null,
      globalChatOpen: false,
    })
  })

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

  it.each([
    ['/assistant', false, 'full-page assistant'],
    ['/papers', true, 'global drawer'],
  ])('keeps stale paper tabs out of the %s scope', (pathname, globalChatOpen) => {
    mocks.storeState.activeTabId = 42
    mocks.storeState.globalChatOpen = globalChatOpen

    render(
      <MemoryRouter initialEntries={[pathname]}>
        <CopilotProvider><main>content</main></CopilotProvider>
      </MemoryRouter>,
    )

    expect(mocks.copilotProps.properties.assistantScope).toBe('global')
    expect(mocks.copilotProps.properties.paperId).toBeNull()
  })

  it('uses the paper id registered by the paper assistant panel', () => {
    mocks.storeState.activeTabId = 42
    mocks.storeState.assistantPaperId = 61

    render(
      <MemoryRouter initialEntries={['/papers']}>
        <CopilotProvider><main>content</main></CopilotProvider>
      </MemoryRouter>,
    )

    expect(mocks.copilotProps.properties.assistantScope).toBe('paper')
    expect(mocks.copilotProps.properties.paperId).toBe(61)
  })

  it('keeps the global drawer global while a paper panel remains mounted', () => {
    mocks.storeState.activeTabId = 42
    mocks.storeState.assistantPaperId = 61
    mocks.storeState.globalChatOpen = true

    render(
      <MemoryRouter initialEntries={['/papers']}>
        <CopilotProvider><main>content</main></CopilotProvider>
      </MemoryRouter>,
    )

    expect(mocks.copilotProps.properties.assistantScope).toBe('global')
    expect(mocks.copilotProps.properties.paperId).toBeNull()
  })
})
