import { useState } from 'react'
import { Button, Input } from '../ui'

export default function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('')
  const [minRelevance, setMinRelevance] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch({ query, minRelevance })
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end">
      <Input
        label="检索"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索论文标题、作者、摘要..."
        className="flex-1"
      />
      <Input
        label="最低相关度"
        type="number"
        value={minRelevance}
        onChange={(e) => setMinRelevance(e.target.value)}
        placeholder="0-10"
        min="0"
        max="10"
        step="0.1"
        className="xl:w-36"
      />
      <Button type="submit" className="xl:mb-0.5">搜索</Button>
    </form>
  )
}
