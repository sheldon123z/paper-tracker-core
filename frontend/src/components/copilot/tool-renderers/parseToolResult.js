/**
 * Parse tool result into { text, data } for rendering.
 *
 * Supports two formats:
 * 1. Pure JSON: { "type": "...", "summary": "...", "data": ... }
 *    → text = summary, data = data field
 * 2. Legacy delimiter: text + ---JSON--- + JSON
 *    → text = before delimiter, data = parsed JSON after delimiter
 * 3. Plain string (errors, simple messages)
 *    → text = the string, data = null
 *
 * @param {string|object} result - Raw tool result
 * @returns {{ text: string, data: any|null }}
 */
export default function parseToolResult(result) {
  if (!result) return { text: '', data: null }

  // Already parsed object (CopilotKit may pre-parse TOOL_CALL_RESULT JSON)
  if (typeof result !== 'string') {
    if (result && typeof result === 'object' && 'type' in result) {
      return { text: result.summary || '', data: result.data ?? result }
    }
    return { text: JSON.stringify(result), data: result }
  }

  // Try pure JSON first (new format: { type, summary, data })
  if (result.startsWith('{') || result.startsWith('[')) {
    try {
      const parsed = JSON.parse(result)
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        return { text: parsed.summary || '', data: parsed.data ?? parsed }
      }
      // JSON array or object without type field — treat as data
      return { text: '', data: parsed }
    } catch {
      // Not valid JSON, fall through
    }
  }

  // Legacy delimiter format
  const sep = '---JSON---\n'
  const idx = result.indexOf(sep)
  if (idx !== -1) {
    const text = result.slice(0, idx).trim()
    const jsonStr = result.slice(idx + sep.length).trim()
    try {
      return { text, data: JSON.parse(jsonStr) }
    } catch {
      return { text: result, data: null }
    }
  }

  // Plain text
  return { text: result, data: null }
}
