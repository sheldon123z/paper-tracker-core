const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on'])

const LOCAL_LLM_PROVIDERS = new Set([
  'ollama',
  'vllm',
  'lmstudio',
  'llamacpp',
])

const OFFLINE_LOCAL_LLM_BASE_URLS = Object.freeze({
  ollama: 'http://model-proxy:11434',
  vllm: 'http://model-proxy:8000/v1',
  lmstudio: 'http://model-proxy:1234/v1',
  llamacpp: 'http://model-proxy:30000/v1',
})

function readEnvString(env, key) {
  const value = env?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function parseEnvFlag(value) {
  return TRUE_ENV_VALUES.has(String(value ?? '').trim().toLowerCase())
}

export function resolveApiBaseUrl(env = {}) {
  return readEnvString(env, 'VITE_API_BASE_URL')
}

export function resolveCopilotRuntimeUrl(env = {}) {
  return readEnvString(env, 'VITE_COPILOT_RUNTIME_URL') || '/api/copilotkit'
}

export function createRuntimeCapabilities(env = {}) {
  const offlineMode = parseEnvFlag(env.VITE_OFFLINE_MODE)

  return Object.freeze({
    offlineMode,
    // RSS is intentionally absent from the current product surface. Keep the
    // capability explicit so offline work cannot accidentally expose it.
    rssSubscriptions: false,
    cloudDocumentParsing: !offlineMode,
    remoteLlmProviders: !offlineMode,
  })
}

export function isLocalLlmConfig(config) {
  if (!config || typeof config !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(config, 'is_local')) {
    return config.is_local === true
  }
  return LOCAL_LLM_PROVIDERS.has(config.provider || config.key)
}

export function filterLlmConfigsForRuntime(configs, capabilities = RUNTIME_CAPABILITIES) {
  if (!Array.isArray(configs)) return []
  if (capabilities.remoteLlmProviders) return configs
  return configs.filter(isLocalLlmConfig)
}

export function getRuntimeDefaultLlmBaseUrl(
  providerKey,
  fallback = '',
  capabilities = RUNTIME_CAPABILITIES,
) {
  if (!capabilities.offlineMode) return fallback
  return OFFLINE_LOCAL_LLM_BASE_URLS[providerKey] || fallback
}

export function prepareLlmProvidersForRuntime(
  providers,
  capabilities = RUNTIME_CAPABILITIES,
) {
  return filterLlmConfigsForRuntime(providers, capabilities).map((provider) => ({
    ...provider,
    default_base_url: getRuntimeDefaultLlmBaseUrl(
      provider.key,
      provider.default_base_url,
      capabilities,
    ),
  }))
}

export function filterUsageRecordsForRuntime(
  records,
  configs,
  capabilities = RUNTIME_CAPABILITIES,
) {
  if (!Array.isArray(records)) return []
  if (capabilities.remoteLlmProviders) return records

  const localConfigIds = new Set(
    filterLlmConfigsForRuntime(configs, capabilities)
      .map((config) => Number(config.id))
      .filter(Number.isFinite),
  )

  return records.filter((record) => {
    if (
      record?.config_id !== null
      && record?.config_id !== undefined
      && record?.config_id !== ''
    ) {
      const configId = Number(record.config_id)
      if (Number.isFinite(configId)) return localConfigIds.has(configId)
    }
    return isLocalLlmConfig(record)
  })
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env)
export const COPILOT_RUNTIME_URL = resolveCopilotRuntimeUrl(import.meta.env)
export const RUNTIME_CAPABILITIES = createRuntimeCapabilities(import.meta.env)
