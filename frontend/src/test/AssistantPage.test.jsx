import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

import useStore from '../store'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  get: vi.fn(),
  history: vi.fn(),
  randomUUID: vi.fn(() => 'generated-session'),
  send: vi.fn(),
}))

vi.mock('../api', () => ({
  default: {
    delete: vi.fn(),
    get: (...args) => mocks.get(...args),
  },
}))

vi.mock('../hooks/useIsMobile', () => ({
  default: () => false,
}))

vi.mock('../components/copilot/ModelSelector', () => ({
  default: () => <div data-testid="model-selector" />,
}))

vi.mock('../components/copilot/useAssistantSessionHistory', () => ({
  default: (...args) => mocks.history(...args),
}))

vi.mock('../components/copilot/CustomAssistantMessage', () => ({
  SINGLE_COPY_MESSAGE_VIEW: {},
}))

vi.mock('../components/ui', () => ({
  AppIcon: () => null,
  Badge: ({ children }) => <span>{children}</span>,
}))

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChat: (props) => {
    mocks.chat(props)
    return (
      <button
        type="button"
        data-testid="copilot-chat"
        data-thread-id={props.threadId}
        onClick={() => mocks.send(props.threadId)}
      >
        模拟发送
      </button>
    )
  },
}))

import AssistantPage from '../pages/AssistantPage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderAssistant(initialEntry) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </StrictMode>,
  )
}

describe('AssistantPage session initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: mocks.randomUUID })
    useStore.setState({
      assistantSessionId: null,
      selectedModelMeta: null,
    })
    mocks.get.mockResolvedValue({
      data: [{ session_id: 'ast-persisted', title: '已有会话' }],
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('allocates a unique session before the first direct-entry message is sent', async () => {
    const user = userEvent.setup()
    renderAssistant('/assistant')

    const chat = await screen.findByTestId('copilot-chat')
    expect(chat).toHaveAttribute('data-thread-id', 'ast-generated-session')
    expect(chat).not.toHaveAttribute('data-thread-id', 'assistant-default')
    expect(useStore.getState().assistantSessionId).toBe('ast-generated-session')
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/assistant?session=ast-generated-session',
    )
    expect(mocks.history).toHaveBeenLastCalledWith('ast-generated-session', true)
    expect(mocks.randomUUID).toHaveBeenCalledTimes(1)
    expect(mocks.chat).toHaveBeenCalled()
    expect(
      mocks.chat.mock.calls.every(
        ([props]) => props.threadId === 'ast-generated-session',
      ),
    ).toBe(true)

    await user.click(chat)
    expect(mocks.send).toHaveBeenCalledWith('ast-generated-session')

    await waitFor(() => {
      expect(document.querySelectorAll('.assistant-session-item')).toHaveLength(2)
    })
  })

  it('keeps an explicitly selected session instead of replacing it', async () => {
    renderAssistant('/assistant?session=ast-selected')

    const chat = await screen.findByTestId('copilot-chat')
    expect(chat).toHaveAttribute('data-thread-id', 'ast-selected')
    expect(useStore.getState().assistantSessionId).toBe('ast-selected')
    expect(mocks.randomUUID).not.toHaveBeenCalled()
    expect(mocks.history).toHaveBeenLastCalledWith('ast-selected', true)
    expect(mocks.chat.mock.calls.every(([props]) => props.threadId === 'ast-selected')).toBe(true)
  })
})
