import { Input } from '../ui'

export default function FilterPanel({ filters, onChange }) {
  const update = (key, value) => onChange({ ...filters, [key]: value })

  return (
    <div className="mb-1 rounded-[22px] border border-glass bg-primary/24 px-3 py-3">
      <div className="panel-header-kicker mb-3">Filters</div>
      <div className="grid gap-3 md:grid-cols-3">
      {['source', 'category', 'tag'].map((key) => (
        <Input
          key={key}
          label={{ source: '来源', category: '分类', tag: '标签' }[key]}
          type="text"
          value={filters[key]}
          onChange={(e) => update(key, e.target.value)}
          placeholder={{ source: '来源', category: '分类', tag: '标签' }[key]}
          className="w-full"
        />
      ))}
      </div>
    </div>
  )
}
