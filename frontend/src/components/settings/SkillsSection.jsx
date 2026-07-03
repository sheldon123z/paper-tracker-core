import { useEffect, useState } from 'react'
import api from '../../api'
import { Card, useToast } from '../ui'

const AGENT_TYPES = [
  { key: 'paper', label: '论文分析 Agent' },
  { key: 'global', label: '全局研究 Agent' },
  { key: 'assistant', label: 'AI 助手 Agent' },
]

export default function SkillsSection() {
  const [skills, setSkills] = useState([])
  const [availableTools, setAvailableTools] = useState([])
  const [activeTab, setActiveTab] = useState('paper')
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    Promise.all([
      api.get('/api/skills/'),
      api.get('/api/skills/available-tools'),
    ])
      .then(([skillsRes, toolsRes]) => {
        setSkills(skillsRes.data)
        setAvailableTools(toolsRes.data)
      })
      .catch(() => toast?.error?.('加载技能配置失败'))
      .finally(() => setLoading(false))
  }, [])

  const filteredSkills = skills.filter((s) => s.agent_type === activeTab)
  const assignedNames = new Set(filteredSkills.map((s) => s.tool_name))
  const unassigned = availableTools.filter((t) => !assignedNames.has(t.name))

  const toggleSkill = async (skill) => {
    try {
      const res = await api.put(`/api/skills/${skill.id}`, { is_enabled: !skill.is_enabled })
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? res.data : s)))
    } catch {
      toast?.error?.('更新失败')
    }
  }

  const addSkill = async (toolName) => {
    try {
      const res = await api.post('/api/skills/', {
        tool_name: toolName,
        agent_type: activeTab,
        is_enabled: true,
      })
      setSkills((prev) => [...prev, res.data])
    } catch {
      toast?.error?.('添加失败')
    }
  }

  const removeSkill = async (skillId) => {
    try {
      await api.delete(`/api/skills/${skillId}`)
      setSkills((prev) => prev.filter((s) => s.id !== skillId))
    } catch {
      toast?.error?.('删除失败')
    }
  }

  const getToolDescription = (toolName) => {
    const tool = availableTools.find((t) => t.name === toolName)
    return tool?.description || ''
  }

  if (loading) {
    return (
      <Card title="Agent 技能管理" className="mb-4">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>加载中...</p>
      </Card>
    )
  }

  return (
    <Card title="Agent 技能管理" className="mb-4">
      {/* Tab bar */}
      <div className="flex gap-1 mb-3">
        {AGENT_TYPES.map((at) => (
          <button
            key={at.key}
            type="button"
            onClick={() => setActiveTab(at.key)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              backgroundColor: activeTab === at.key ? 'var(--accent)' : 'var(--bg-secondary)',
              color: activeTab === at.key ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {at.label}
          </button>
        ))}
      </div>

      {/* Skill list */}
      <div className="space-y-1.5">
        {filteredSkills.length === 0 && (
          <p className="text-xs py-2" style={{ color: 'var(--text-secondary)' }}>
            此 Agent 尚未分配工具
          </p>
        )}
        {filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className="flex items-center gap-2 px-3 py-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
              <input
                type="checkbox"
                checked={skill.is_enabled}
                onChange={() => toggleSkill(skill)}
                className="accent-[var(--accent)] shrink-0"
              />
              <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-primary)' }}>
                {skill.tool_name}
              </span>
              <span
                className="text-xs truncate"
                style={{ color: 'var(--text-secondary)' }}
                title={getToolDescription(skill.tool_name)}
              >
                {getToolDescription(skill.tool_name)}
              </span>
            </label>
            <button
              type="button"
              onClick={() => removeSkill(skill.id)}
              className="shrink-0 p-1 rounded opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
              title="移除"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add tool dropdown */}
      {unassigned.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            id="add-skill-select"
            className="flex-1 rounded-md text-xs"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              padding: '6px 8px',
            }}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                addSkill(e.target.value)
                e.target.value = ''
              }
            }}
          >
            <option value="" disabled>
              + 添加工具到此 Agent...
            </option>
            {unassigned.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Card>
  )
}
