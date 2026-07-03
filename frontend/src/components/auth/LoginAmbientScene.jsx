import { useMemo } from 'react'

/**
 * Left visual zone: SVG topology network + hero copy + floating data chips.
 * Purely decorative — conveys "Research Grid Nexus" atmosphere.
 */
export default function LoginAmbientScene() {
  const nodes = useMemo(() => generateNodes(14), [])
  const edges = useMemo(() => generateEdges(nodes, 18), [nodes])

  return (
    <div className="login-visual">
      {/* SVG topology background */}
      <div className="login-topology">
        <svg viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice">
          {/* Connection lines */}
          {edges.map((e, i) => (
            <line
              key={`edge-${i}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              className={i % 3 === 0 ? 'topo-line-alt' : 'topo-line'}
              style={{ animationDelay: `${-(i * 0.7)}s` }}
            />
          ))}
          {/* Node glows */}
          {nodes.map((n, i) => (
            <circle
              key={`glow-${i}`}
              cx={n.x}
              cy={n.y}
              r={n.r * 3}
              className="topo-node-glow"
              style={{ animationDelay: `${-(i * 1.2)}s` }}
            />
          ))}
          {/* Nodes */}
          {nodes.map((n, i) => (
            <circle
              key={`node-${i}`}
              cx={n.x}
              cy={n.y}
              r={n.r}
              className="topo-node"
              style={{ animationDelay: `${-(i * 1.2)}s` }}
            />
          ))}
          {/* Energy arc from bottom-left to top-right */}
          <path
            d="M 50 650 Q 200 400 400 250 Q 500 180 580 80"
            fill="none"
            className="topo-line"
            style={{ strokeWidth: 1.2, strokeOpacity: 0.08, animationDuration: '14s' }}
          />
        </svg>
      </div>

      {/* Eyebrow */}
      <span className="login-eyebrow">安全研究通道</span>

      {/* Hero */}
      <h1 className="login-hero-title">
        进入{' '}
        <span className="accent">研究网格</span>
      </h1>

      {/* Subcopy */}
      <p className="login-hero-sub">
        登录以访问您的论文数据库、同步订阅源
        和 AI 辅助研究工作区。
      </p>

      {/* Floating data chips */}
      <div className="login-chips">
        <DataChip
          icon={<FeedIcon />}
          color="cyan"
          label="订阅信号"
          value="实时采集"
        />
        <DataChip
          icon={<GraphIcon />}
          color="mint"
          label="研究图谱"
          value="论文 & 智能体"
        />
        <DataChip
          icon={<VaultIcon />}
          color="gold"
          label="私有保险库"
          value="数据库隔离"
        />
      </div>
    </div>
  )
}

/* ---- Data Chip Component ---- */
function DataChip({ icon, color, label, value }) {
  return (
    <div className="login-chip">
      <div className={`login-chip-icon ${color}`}>{icon}</div>
      <div>
        <div className="login-chip-label">{label}</div>
        <div className="login-chip-value">{value}</div>
      </div>
    </div>
  )
}

/* ---- Inline SVG Icons (Lucide-style) ---- */
function FeedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  )
}

function GraphIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <circle cx="5" cy="6" r="1.5" />
      <circle cx="19" cy="6" r="1.5" />
      <circle cx="5" cy="18" r="1.5" />
      <circle cx="19" cy="18" r="1.5" />
      <line x1="10.5" y1="10.5" x2="6.2" y2="7.2" />
      <line x1="13.5" y1="10.5" x2="17.8" y2="7.2" />
      <line x1="10.5" y1="13.5" x2="6.2" y2="16.8" />
      <line x1="13.5" y1="13.5" x2="17.8" y2="16.8" />
    </svg>
  )
}

function VaultIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  )
}

/* ---- Topology Graph Generation ---- */
function generateNodes(count) {
  // Deterministic pseudo-random using seed
  const seed = 42
  const rand = mulberry32(seed)
  const nodes = []
  for (let i = 0; i < count; i++) {
    nodes.push({
      x: 40 + rand() * 520,
      y: 40 + rand() * 620,
      r: 2 + rand() * 3,
    })
  }
  return nodes
}

function generateEdges(nodes, maxEdges) {
  const edges = []
  for (let i = 0; i < nodes.length && edges.length < maxEdges; i++) {
    for (let j = i + 1; j < nodes.length && edges.length < maxEdges; j++) {
      const dx = nodes[i].x - nodes[j].x
      const dy = nodes[i].y - nodes[j].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 200) {
        edges.push({
          x1: nodes[i].x,
          y1: nodes[i].y,
          x2: nodes[j].x,
          y2: nodes[j].y,
        })
      }
    }
  }
  return edges
}

// Deterministic PRNG
function mulberry32(seed) {
  let s = seed | 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
