import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PaperTagSelector from '../components/paper/PaperTagSelector'

describe('PaperTagSelector', () => {
  const options = [
    { id: 1, name: '大语言模型', color: '#ef4444' },
    { id: 2, name: '检索增强', color: '#22c55e' },
  ]

  it('keeps direct entry available for creating new tags', () => {
    const onChange = vi.fn()
    render(<PaperTagSelector value="" onChange={onChange} options={options} />)

    fireEvent.change(screen.getByRole('textbox', { name: '论文标签' }), { target: { value: '新标签' } })
    expect(onChange).toHaveBeenCalledWith('新标签')
  })

  it('adds and removes existing tags from the dropdown', () => {
    const onChange = vi.fn()
    const { rerender } = render(<PaperTagSelector value="大语言模型" onChange={onChange} options={options} />)

    fireEvent.click(screen.getByRole('button', { name: /选择已有标签/ }))
    expect(screen.getByRole('option', { name: '大语言模型' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('option', { name: '检索增强' }))
    expect(onChange).toHaveBeenLastCalledWith('大语言模型, 检索增强')

    rerender(<PaperTagSelector value="大语言模型, 检索增强" onChange={onChange} options={options} />)
    fireEvent.click(screen.getByRole('option', { name: '大语言模型' }))
    expect(onChange).toHaveBeenLastCalledWith('检索增强')
  })
})
