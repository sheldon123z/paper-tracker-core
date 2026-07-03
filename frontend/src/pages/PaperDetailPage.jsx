import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import api from '../api'
import { Button, Card, Input } from '../components/ui'

export default function PaperDetailPage() {
  const { id } = useParams()
  const [paper, setPaper] = useState(null)
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    api.get(`/api/papers/${id}`).then((res) => {
      setPaper(res.data)
      setNotes(res.data.notes || '')
      setTags(res.data.tags || '')
    })
  }, [id])

  const saveNotes = async () => {
    const res = await api.patch(`/api/papers/${id}`, { notes })
    setPaper(res.data)
  }

  const saveTags = async () => {
    const normalizedTags = tags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    await api.post(`/api/papers/${id}/tags`, { tags: normalizedTags })
    const res = await api.get(`/api/papers/${id}`)
    setPaper(res.data)
  }

  if (!paper) {
    return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>加载中...</p>
  }

  return (
    <section className="space-y-4 p-4">
      <div>
        <div className="panel-header-kicker mb-2">Paper Record</div>
        <h1 className="section-title text-xl font-bold" style={{ color: 'var(--text-primary)' }}>论文详情</h1>
      </div>

      <Card surface="premium">
        <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{paper.title}</h2>
        <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{paper.authors}</p>
        <a className="text-sm text-accent hover:underline" href={paper.link} target="_blank" rel="noreferrer">
          查看原文
        </a>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7" style={{ color: 'var(--text-primary)' }}>{paper.abstract}</p>
      </Card>

      <Card title="笔记" surface="medium">
        <div className="grid gap-3">
          <textarea
            className="input-surface min-h-28 rounded-2xl border px-4 py-3 text-sm outline-none text-primary"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button className="w-fit" onClick={saveNotes} type="button">保存笔记</Button>
        </div>
      </Card>

      <Card title="标签（逗号分隔）" surface="medium">
        <div className="grid gap-3">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          <Button className="w-fit" onClick={saveTags} type="button">保存标签</Button>
        </div>
      </Card>
    </section>
  )
}
