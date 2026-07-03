export default function PaperCard({ paper, onToggleRead, onToggleFavorite }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{paper.title}</h3>
        <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
          {paper.relevance}
        </span>
      </div>
      <p className="mb-2 text-sm text-slate-600">{paper.authors}</p>
      <p className="mb-3 line-clamp-3 text-sm text-slate-700">{paper.abstract}</p>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">{paper.category}</span>
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">{paper.source}</span>
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
          onClick={() => onToggleRead(paper)}
          type="button"
        >
          {paper.is_read ? '标记未读' : '标记已读'}
        </button>
        <button
          className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
          onClick={() => onToggleFavorite(paper)}
          type="button"
        >
          {paper.is_favorited ? '取消收藏' : '收藏'}
        </button>
      </div>
    </article>
  )
}
