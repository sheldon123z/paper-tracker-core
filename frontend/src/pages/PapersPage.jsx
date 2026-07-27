import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

import api from '../api'
import ExpandedPaperFiles from '../components/paper/ExpandedPaperFiles'
import FilterPanel from '../components/paper/FilterPanel'
import PdfBatchImportModal from '../components/paper/PdfBatchImportModal'
import SearchBar from '../components/paper/SearchBar'
import { Badge, Button, Modal, Select, useToast } from '../components/ui'
import useIsMobile from '../hooks/useIsMobile'
import { PAPER_TAGS_UPDATED_EVENT } from '../paperEvents'
import useStore from '../store'

// ── Icons ──────────────────────────────────────────────────────────

function IconRead({ active }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function IconStar({ active }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function RelevanceBadge({ value }) {
  const num = parseFloat(value)
  if (isNaN(num)) return <Badge variant="neutral">—</Badge>
  const variant = num >= 8 ? 'success' : num >= 6 ? 'warning' : num >= 4 ? 'danger' : 'neutral'
  return <Badge variant={variant}>{num.toFixed(1)}</Badge>
}

function LibraryBadge({ paper }) {
  const isPublic = paper.visibility === 'public'
  return <Badge variant={isPublic ? 'success' : 'neutral'}>{isPublic ? '公共库' : (paper.department_name || '部门库')}</Badge>
}

function PaperTags({ value, colors = {} }) {
  const tags = (Array.isArray(value) ? value : String(value || '').split(','))
    .map((tag) => typeof tag === 'string' ? tag.trim() : tag?.name?.trim())
    .filter(Boolean)

  if (tags.length === 0) {
    return <span style={{ color: 'var(--text-secondary)' }}>—</span>
  }

  return (
    <div className="flex flex-wrap gap-1" aria-label={`标签：${tags.join('、')}`}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs"
          style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
          title={tag}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: colors[tag] || 'var(--accent)' }}
            data-testid={`tag-color-${tag}`}
            aria-hidden="true"
          />
          {tag}
        </span>
      ))}
    </div>
  )
}

// ── Sort indicator ────────────────────────────────────────────────

function SortIcon({ direction }) {
  if (!direction) {
    return <span style={{ opacity: 0.3, fontSize: 10 }}>⇅</span>
  }
  return <span style={{ fontSize: 10 }}>{direction === 'asc' ? '↑' : '↓'}</span>
}

// ── Main Component ────────────────────────────────────────────────

export default function PapersPage() {
  const [papers, setPapers] = useState([])
  const [meta, setMeta] = useState({ total: 0, page: 1, size: 20 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useState({ query: '', minRelevance: '' })
  const [filters, setFilters] = useState({ source: '', category: '', tag: '' })
  const [selected, setSelected] = useState(new Set())
  const [sortBy, setSortBy] = useState('published_date')
  const [sortDir, setSortDir] = useState('desc')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [expandedRows, setExpandedRows] = useState({})
  const [expandedData, setExpandedData] = useState({})
  const [tagColors, setTagColors] = useState({})
  const [libraryScope, setLibraryScope] = useState('all')
  const [departments, setDepartments] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const { openTab, user } = useStore()
  const { addToast } = useToast()
  const isMobile = useIsMobile()

  const scopeParams = () => {
    if (libraryScope === 'public') return { library_scope: 'public' }
    if (libraryScope === 'department') return { library_scope: 'department' }
    if (libraryScope.startsWith('department:')) {
      return { library_scope: 'department', department_id: Number(libraryScope.split(':')[1]) }
    }
    return {}
  }

  // ── Data fetching ────────────────────────────────────────────

  const loadPapers = async (p = page) => {
    setLoading(true)
    try {
      const params = {
        page: p, size: 20,
        search: searchParams.query || undefined,
        min_relevance: searchParams.minRelevance || undefined,
        source: filters.source || undefined,
        category: filters.category || undefined,
        tag: filters.tag || undefined,
        sort_by: sortBy || undefined,
        sort_dir: sortDir || undefined,
        ...scopeParams(),
      }
      const res = await api.get('/api/papers', { params })
      setPapers(res.data.items || [])
      setMeta(res.data.meta || { total: 0, page: p, size: 20 })
      setPage(p)
      setSelected(new Set())
      setExpandedData({})
    } catch (err) {
      console.error('Failed to load papers', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPapers(1) }, [filters, libraryScope]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadPapers(page) }, [sortBy, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get('/api/tags')
      .then((res) => {
        const colors = Object.fromEntries(
          (res.data || []).filter((tag) => tag?.name).map((tag) => [tag.name, tag.color])
        )
        setTagColors(colors)
      })
      .catch(() => setTagColors({}))
  }, [])
  useEffect(() => {
    if (user?.role !== 'manager') return
    api.get('/api/admin/departments').then((res) => setDepartments(res.data || [])).catch(() => setDepartments([]))
  }, [user?.role])
  useEffect(() => {
    const handleTagsUpdated = (event) => {
      const { paperId, tags: updatedTags, tagRecords = [] } = event.detail || {}
      setPapers((current) => current.map((paper) => (
        paper.id === paperId ? { ...paper, tags: updatedTags } : paper
      )))
      setTagColors((current) => ({
        ...current,
        ...Object.fromEntries(tagRecords.map((tag) => [tag.name, tag.color])),
      }))
    }
    window.addEventListener(PAPER_TAGS_UPDATED_EVENT, handleTagsUpdated)
    return () => window.removeEventListener(PAPER_TAGS_UPDATED_EVENT, handleTagsUpdated)
  }, [])

  const handleSearch = (params) => {
    setSearchParams(params)
    const load = async () => {
      setLoading(true)
      try {
        const reqParams = {
          page: 1, size: 20,
          search: params.query || undefined,
          min_relevance: params.minRelevance || undefined,
          source: filters.source || undefined,
          category: filters.category || undefined,
          tag: filters.tag || undefined,
          sort_by: sortBy || undefined,
          sort_dir: sortDir || undefined,
          ...scopeParams(),
        }
        const res = await api.get('/api/papers', { params: reqParams })
        setPapers(res.data.items || [])
        setMeta(res.data.meta || { total: 0, page: 1, size: 20 })
        setPage(1)
        setSelected(new Set())
      } catch (err) {
        console.error('Failed to search papers', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }

  // ── Actions ──────────────────────────────────────────────────

  const toggleSelect = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleExpand = (paperId) => {
    setExpandedRows((prev) => {
      const next = { ...prev, [paperId]: !prev[paperId] }
      if (next[paperId] && !expandedData[paperId]) {
        setExpandedData((d) => ({ ...d, [paperId]: { files: [], loading: true } }))
        api.get(`/api/papers/${paperId}/files`)
          .then((res) => {
            setExpandedData((d) => ({ ...d, [paperId]: { files: res.data, loading: false } }))
          })
          .catch(() => {
            setExpandedData((d) => ({ ...d, [paperId]: { files: [], loading: false } }))
          })
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === papers.length) setSelected(new Set())
    else setSelected(new Set(papers.map((p) => p.id)))
  }

  const batchAction = async (action) => {
    try {
      await api.post('/api/papers/batch', { paper_ids: [...selected], action })
      setSelected(new Set())
      await loadPapers(page)
      return true
    } catch (err) {
      console.error('Batch action failed', err)
      return false
    }
  }

  const handleBatchDelete = async () => {
    const count = selected.size
    setBatchDeleting(true)
    const deleted = await batchAction('delete')
    setBatchDeleting(false)

    if (deleted) {
      setDeleteConfirm(false)
      addToast({ type: 'success', message: `已删除 ${count} 篇论文` })
    } else {
      addToast({ type: 'error', message: '删除失败，请稍后重试' })
    }
  }

  const toggleRead = async (paper, e) => {
    e.stopPropagation()
    try { await api.patch(`/api/papers/${paper.id}`, { is_read: !paper.is_read }); loadPapers(page) } catch {}
  }
  const toggleFavorite = async (paper, e) => {
    e.stopPropagation()
    try { await api.patch(`/api/papers/${paper.id}`, { is_favorited: !paper.is_favorited }); loadPapers(page) } catch {}
  }

  const handleExport = async () => {
    try {
      const res = await api.get('/api/papers/export/bibtex')
      const blob = new Blob([res.data], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'papers.bib'; a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  // ── TanStack Table columns ──────────────────────────────────

  const columns = useMemo(() => [
    {
      id: 'expand',
      size: 30,
      minSize: 30,
      maxSize: 30,
      enableResizing: false,
      header: () => null,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleExpand(row.original.id) }}
          className="flex items-center justify-center w-5 h-5 rounded transition-transform"
          style={{
            color: 'var(--text-secondary)',
            transform: expandedRows[row.original.id] ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          ▸
        </button>
      ),
    },
    {
      id: 'select',
      size: 34,
      minSize: 34,
      maxSize: 34,
      enableResizing: false,
      header: () => {
        const allSelected = papers.length > 0 && selected.size === papers.length
        const someSelected = selected.size > 0 && selected.size < papers.length
        return (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected }}
            onChange={toggleSelectAll}
            className="cursor-pointer"
          />
        )
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selected.has(row.original.id)}
          onChange={() => toggleSelect(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      ),
    },
    {
      accessorKey: 'title',
      header: '标题',
      size: 240,
      minSize: 160,
      cell: ({ getValue }) => (
        <div className="truncate font-medium" style={{ color: 'var(--text-primary)' }} title={getValue()}>
          {getValue()}
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'authors',
      header: '作者',
      size: 130,
      minSize: 90,
      cell: ({ getValue }) => (
        <div className="truncate" style={{ color: 'var(--text-secondary)' }} title={getValue()}>
          {getValue() || '—'}
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: '分类',
      size: 80,
      minSize: 64,
      cell: ({ getValue }) => {
        const v = getValue()
        return v ? (
          <span className="inline-block rounded px-1.5 py-0.5 text-xs truncate max-w-full"
            style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
          >{v}</span>
        ) : '—'
      },
      enableSorting: true,
    },
    {
      id: 'library',
      header: '库范围',
      size: 82,
      minSize: 72,
      cell: ({ row }) => <LibraryBadge paper={row.original} />,
    },
    {
      accessorKey: 'tags',
      header: '标签',
      size: 110,
      minSize: 80,
      cell: ({ getValue }) => <PaperTags value={getValue()} colors={tagColors} />,
    },
    {
      accessorKey: 'source',
      header: '来源',
      size: 62,
      minSize: 54,
      cell: ({ getValue }) => <span style={{ color: 'var(--text-secondary)' }}>{getValue() || '—'}</span>,
      enableSorting: true,
    },
    {
      accessorKey: 'relevance',
      header: '相关度',
      size: 62,
      minSize: 56,
      cell: ({ getValue }) => <RelevanceBadge value={getValue()} />,
      enableSorting: true,
    },
    {
      id: 'status',
      header: '状态',
      size: 62,
      minSize: 58,
      enableResizing: false,
      cell: ({ row }) => {
        const paper = row.original
        return (
          <div className="flex items-center justify-center gap-1.5">
            <button type="button" title={paper.is_read ? '标记未读' : '标记已读'} onClick={(e) => toggleRead(paper, e)}
              className="opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: paper.is_read ? 'var(--accent)' : 'var(--text-secondary)' }}
            ><IconRead active={paper.is_read} /></button>
            <button type="button" title={paper.is_favorited ? '取消收藏' : '收藏'} onClick={(e) => toggleFavorite(paper, e)}
              className="opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: paper.is_favorited ? '#f59e0b' : 'var(--text-secondary)' }}
            ><IconStar active={paper.is_favorited} /></button>
          </div>
        )
      },
    },
    {
      accessorKey: 'published_date',
      header: '日期',
      size: 88,
      minSize: 76,
      cell: ({ getValue }) => <span style={{ color: 'var(--text-secondary)' }}>{formatDate(getValue())}</span>,
      enableSorting: true,
    },
  ], [papers, selected, expandedRows, tagColors]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── TanStack Table instance ─────────────────────────────────

  // Sorting state synced with server-side sort params
  const [sorting, setSorting] = useState([{ id: 'published_date', desc: true }])

  const toggleColumnSorting = (columnId) => {
    setSorting((current) => {
      const active = current[0]
      return [{ id: columnId, desc: active?.id === columnId ? !active.desc : true }]
    })
  }

  // Sync TanStack sorting → our sortBy/sortDir → triggers useEffect → reloads data
  useEffect(() => {
    if (sorting.length > 0) {
      const newSortBy = sorting[0].id
      const newSortDir = sorting[0].desc ? 'desc' : 'asc'
      if (newSortBy !== sortBy || newSortDir !== sortDir) {
        setSortBy(newSortBy)
        setSortDir(newSortDir)
      }
    }
  }, [sorting]) // eslint-disable-line react-hooks/exhaustive-deps

  const table = useReactTable({
    data: papers,
    columns,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: 50, maxSize: 1000 },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    state: { sorting },
    onSortingChange: setSorting,
  })

  const totalPages = Math.ceil(meta.total / (meta.size || 20))

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="glass-panel glass-premium panel-outline rounded-shell border px-4 py-4" style={{ borderColor: 'var(--glass-stroke)' }}>
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="panel-header-kicker mb-2">Research Archive</div>
            <h1 className="font-display text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            论文列表
            {meta.total > 0 && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>共 {meta.total} 篇</span>}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>批量导入 PDF</Button>
            <Button variant="secondary" size="sm" onClick={handleExport}>导出 BibTeX</Button>
          </div>
        </div>
        <SearchBar onSearch={handleSearch} />
        <div className="mt-3 max-w-xs">
          <Select
            label="论文库范围"
            value={libraryScope}
            onChange={setLibraryScope}
            options={[
              { value: 'all', label: '全部可见论文' },
              { value: 'public', label: '公共数据库' },
              ...(user?.role === 'manager'
                ? departments.map((department) => ({ value: `department:${department.id}`, label: `${department.name} 私有库` }))
                : [{ value: 'department', label: '本部门私有库' }]),
            ]}
          />
        </div>
        <FilterPanel filters={filters} onChange={setFilters} />
      </div>

      {/* Batch Toolbar */}
      {selected.size > 0 && (
        <div className="glass-panel glass-medium flex items-center gap-2 flex-wrap rounded-[24px] border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--glass-stroke)', backgroundColor: 'var(--accent-light)' }}
        >
          <span style={{ color: 'var(--accent)' }}>已选 {selected.size} 篇</span>
          <Button variant="secondary" size="sm" onClick={() => batchAction('mark_read')}>标记已读</Button>
          <Button variant="secondary" size="sm" onClick={() => batchAction('favorite')}>收藏</Button>
          <Button variant="secondary" size="sm" onClick={handleExport}>导出 BibTeX</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>删除</Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>取消选择</Button>
        </div>
      )}

      {/* Table (desktop) / Card list (mobile) */}
      {isMobile ? (
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-panel glass-medium rounded-shell border p-3" style={{ borderColor: 'var(--glass-stroke)' }}>
                <div className="h-4 rounded bg-[var(--bg-secondary)] animate-pulse mb-2 w-3/4" />
                <div className="h-3 rounded bg-[var(--bg-secondary)] animate-pulse w-1/2" />
              </div>
            ))
          ) : papers.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>暂无数据</div>
          ) : (
            papers.map((p) => (
              <div
                key={p.id}
                onClick={() => openTab(p)}
                className="glass-panel glass-medium rounded-shell border p-3 cursor-pointer active:opacity-80 transition-opacity"
                style={{
                  borderColor: selected.has(p.id) ? 'var(--accent)' : 'var(--glass-stroke)',
                  backgroundColor: selected.has(p.id) ? 'var(--accent-light)' : undefined,
                }}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer mt-1 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2 leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {p.title}
                    </p>
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                      {p.authors || '—'}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {p.category && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {p.category}
                        </span>
                      )}
                      <LibraryBadge paper={p} />
                      <PaperTags value={p.tags} colors={tagColors} />
                      {p.relevance != null && <RelevanceBadge value={p.relevance} />}
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(p.published_date)}</span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button type="button" onClick={(e) => toggleRead(p, e)} className="opacity-60" style={{ color: p.is_read ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          <IconRead active={p.is_read} />
                        </button>
                        <button type="button" onClick={(e) => toggleFavorite(p, e)} className="opacity-60" style={{ color: p.is_favorited ? '#f59e0b' : 'var(--text-secondary)' }}>
                          <IconStar active={p.is_favorited} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
      <div className="glass-panel glass-medium panel-outline overflow-auto rounded-shell border" style={{ borderColor: 'var(--glass-stroke)' }}>
        <table className="w-full border-collapse" style={{ fontSize: 14, tableLayout: 'fixed' }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(var(--accent-rgb),0.05)', color: 'var(--text-secondary)' }}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}
                    className="px-2 py-2.5 border-b text-left font-medium select-none"
                    style={{ borderColor: 'var(--border)', width: header.getSize(), position: 'relative' }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={() => toggleColumnSorting(header.column.id)}
                        aria-label={`${String(header.column.columnDef.header)}，${header.column.getIsSorted() === 'asc' ? '当前升序，切换为降序' : header.column.getIsSorted() === 'desc' ? '当前降序，切换为升序' : '切换为升序'}`}
                        className="flex items-center gap-1 hover:opacity-80 font-medium"
                        style={{ color: header.column.getIsSorted() ? 'var(--accent)' : 'var(--text-secondary)' }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    )}

                    {/* Resize handle */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none z-10"
                        style={{
                          backgroundColor: header.column.getIsResizing() ? 'var(--accent)' : 'transparent',
                          transform: 'translateX(50%)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent)' }}
                        onMouseLeave={(e) => { if (!header.column.getIsResizing()) e.currentTarget.style.backgroundColor = 'transparent' }}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((_, j) => (
                    <td key={j} className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                      <div className="h-3 rounded bg-[var(--bg-secondary)] animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : papers.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                  暂无数据
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isSelected = selected.has(row.original.id)
                const isExpanded = expandedRows[row.original.id]
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => openTab(row.original)}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                        backgroundColor: isSelected ? 'var(--accent-light)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSelected ? 'var(--accent-light)' : 'transparent' }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-2 py-2.5 border-b" style={{ borderColor: 'var(--border)', width: cell.column.getSize() }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={columns.length} style={{ padding: 0 }}>
                          <ExpandedPaperFiles
                            paperId={row.original.id}
                            data={expandedData[row.original.id]}
                            paper={row.original}
                            onOpenFile={(fileId) => openTab(row.original, { fileId })}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Pagination */}
      <div
        className="glass-panel glass-subtle flex items-center justify-between gap-2 flex-wrap px-4 py-3 text-xs rounded-[24px]"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--glass-stroke)' }}
      >
        <span>第 {page} / {totalPages || 1} 页，共 {meta.total} 篇</span>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => loadPapers(page - 1)}>上一页</Button>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => loadPapers(page + 1)}>下一页</Button>
        </div>
      </div>

      <Modal isOpen={deleteConfirm} onClose={() => !batchDeleting && setDeleteConfirm(false)} title="删除论文"
        actions={<>
          <Button variant="ghost" disabled={batchDeleting} onClick={() => setDeleteConfirm(false)}>取消</Button>
          <Button variant="danger" loading={batchDeleting} onClick={handleBatchDelete}>确认删除</Button>
        </>}
      >
        <p>确定删除已选择的 {selected.size} 篇论文？相关附件也会一并删除，此操作不可撤销。</p>
      </Modal>
      <PdfBatchImportModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        user={user}
        departments={departments}
        onImported={() => loadPapers(1)}
        addToast={addToast}
      />
    </div>
  )
}
