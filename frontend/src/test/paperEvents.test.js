import { describe, expect, it, vi } from 'vitest'

import { notifyPaperTagsUpdated, PAPER_TAGS_UPDATED_EVENT } from '../paperEvents'

describe('paper events', () => {
  it('publishes canonical tag names and records after save', () => {
    const listener = vi.fn()
    window.addEventListener(PAPER_TAGS_UPDATED_EVENT, listener)

    notifyPaperTagsUpdated(42, [{ id: 1, name: '新标签', color: '#8b5cf6' }])

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0].detail).toEqual({
      paperId: 42,
      tags: '新标签',
      tagRecords: [{ id: 1, name: '新标签', color: '#8b5cf6' }],
    })
    window.removeEventListener(PAPER_TAGS_UPDATED_EVENT, listener)
  })
})
