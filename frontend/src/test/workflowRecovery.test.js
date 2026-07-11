import { describe, expect, it, vi } from 'vitest'

import { waitForPersistedWorkflow } from '../components/workflow/workflowRecovery'

describe('waitForPersistedWorkflow', () => {
  it('survives a transient request error and returns the completed report snapshot', async () => {
    const completed = {
      workflow_status: 'completed',
      current_stage: 'completed',
      final_report: '# 已恢复的报告',
    }
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary disconnect'))
      .mockResolvedValueOnce({
        data: {
          workflow_status: 'completed',
          state_snapshot: completed,
        },
      })
    const onSnapshot = vi.fn()

    const result = await waitForPersistedWorkflow({
      sessionId: 'wf-recovery',
      request,
      onSnapshot,
      wait: async () => {},
      maxAttempts: 2,
    })

    expect(result.status).toBe('completed')
    expect(result.snapshot.final_report).toContain('已恢复的报告')
    expect(onSnapshot).toHaveBeenCalledWith(completed)
  })
})
