import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ParamsForm from '../components/workflow/ParamsForm'
import useStore from '../store'

const template = {
  id: 'literature_survey',
  name: '文献调研',
  description: '围绕研究主题生成调研报告',
  icon: 'book',
  steps: [
    {
      id: 'topic',
      label: '研究主题',
      type: 'text',
      required: true,
      default: '',
      placeholder: '例如：MARL',
    },
  ],
}

const catalog = [
  {
    id: 4,
    label: 'qwen3.5-9b',
    model_name: 'qwen/qwen3.5-9b',
    provider: 'lmstudio',
    provider_label: 'LM Studio',
    health_status: 'ok',
    is_local: true,
    is_default: true,
  },
  {
    id: 5,
    label: 'glm-5.1',
    model_name: 'glm-5.1',
    provider: 'openai_compatible',
    provider_label: 'OpenAI 兼容',
    health_status: 'ok',
    is_local: false,
    is_default: false,
  },
]

describe('ParamsForm LLM configuration', () => {
  beforeEach(() => {
    useStore.getState().setLlmCatalog(catalog)
    useStore.getState().setSelectedModelId(4)
  })

  it('requires an explicit LLM config and submits its ID with workflow params', () => {
    const onStart = vi.fn()
    render(<ParamsForm template={template} onStart={onStart} onBack={() => {}} />)

    const modelSelect = screen.getByLabelText(/LLM 配置/)
    expect(modelSelect).toHaveValue('4')

    fireEvent.change(screen.getByPlaceholderText('例如：MARL'), { target: { value: 'marl' } })
    fireEvent.change(modelSelect, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /开始工作流/ }))

    expect(onStart).toHaveBeenCalledWith({ topic: 'marl' }, 5)
    expect(useStore.getState().selectedModelId).toBe(5)
  })

  it('blocks workflow creation when no enabled LLM config exists', () => {
    useStore.getState().setLlmCatalog([])
    const onStart = vi.fn()
    render(<ParamsForm template={template} onStart={onStart} onBack={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('例如：MARL'), { target: { value: 'marl' } })

    expect(screen.getByText(/暂无可用 LLM 配置/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /开始工作流/ })).toBeDisabled()
    expect(onStart).not.toHaveBeenCalled()
  })
})
