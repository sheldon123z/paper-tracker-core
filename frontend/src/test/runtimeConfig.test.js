import { describe, expect, it } from 'vitest'
import {
  createRuntimeCapabilities,
  filterLlmConfigsForRuntime,
  filterUsageRecordsForRuntime,
  getRuntimeDefaultLlmBaseUrl,
  prepareLlmProvidersForRuntime,
  resolveApiBaseUrl,
  resolveCopilotRuntimeUrl,
} from '../config/runtime'

describe('runtime configuration', () => {
  it('uses same-origin endpoints by default', () => {
    expect(resolveApiBaseUrl({})).toBe('')
    expect(resolveCopilotRuntimeUrl({})).toBe('/api/copilotkit')
    expect(createRuntimeCapabilities({}).offlineMode).toBe(false)
  })

  it('preserves explicit API and Copilot runtime URLs', () => {
    expect(resolveApiBaseUrl({
      VITE_API_BASE_URL: ' https://paper.example.test ',
    })).toBe('https://paper.example.test')
    expect(resolveCopilotRuntimeUrl({
      VITE_COPILOT_RUNTIME_URL: ' https://runtime.example.test/copilot ',
    })).toBe('https://runtime.example.test/copilot')
  })

  it('disables remote-only capabilities and filters model catalogs offline', () => {
    const capabilities = createRuntimeCapabilities({ VITE_OFFLINE_MODE: 'true' })
    const catalog = [
      { id: 1, provider: 'openai', is_local: false },
      { id: 2, provider: 'ollama', is_local: true },
      { id: 3, provider: 'lmstudio' },
    ]

    expect(capabilities).toMatchObject({
      offlineMode: true,
      rssSubscriptions: false,
      cloudDocumentParsing: false,
      remoteLlmProviders: false,
    })
    expect(filterLlmConfigsForRuntime(catalog, capabilities).map((item) => item.id))
      .toEqual([2, 3])
  })

  it('filters usage by its related local config even without provider metadata', () => {
    const capabilities = createRuntimeCapabilities({ VITE_OFFLINE_MODE: 'true' })
    const configs = [
      { id: 11, provider: 'openai_compatible', is_local: true },
      { id: 12, provider: 'openai', is_local: false },
    ]
    const usage = [
      { config_id: 11, model_name: 'local-custom', total_tokens: 10 },
      { config_id: 12, model_name: 'remote-cloud', total_tokens: 20 },
      { config_id: null, provider: 'ollama', model_name: 'deleted-local', total_tokens: 30 },
    ]

    expect(filterUsageRecordsForRuntime(usage, configs, capabilities))
      .toEqual([usage[0], usage[2]])
  })

  it('maps local provider defaults through the fixed offline model proxy', () => {
    const capabilities = createRuntimeCapabilities({ VITE_OFFLINE_MODE: 'true' })
    const providers = prepareLlmProvidersForRuntime([
      { key: 'ollama', is_local: true, default_base_url: 'http://127.0.0.1:11434' },
      { key: 'vllm', is_local: true, default_base_url: 'http://127.0.0.1:8000/v1' },
      { key: 'openai', is_local: false, default_base_url: 'https://api.openai.com/v1' },
    ], capabilities)

    expect(providers).toEqual([
      expect.objectContaining({
        key: 'ollama',
        default_base_url: 'http://model-proxy:11434',
      }),
      expect.objectContaining({
        key: 'vllm',
        default_base_url: 'http://model-proxy:8000/v1',
      }),
    ])
    expect(getRuntimeDefaultLlmBaseUrl('lmstudio', '', capabilities))
      .toBe('http://model-proxy:1234/v1')
    expect(getRuntimeDefaultLlmBaseUrl('llamacpp', '', capabilities))
      .toBe('http://model-proxy:30000/v1')
  })
})
