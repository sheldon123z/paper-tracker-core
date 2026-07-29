import { useCallback, useEffect, useMemo, useState } from 'react'

import api from '../api'
import { Badge, Button, Card, Input, Modal, Select, useToast } from '../components/ui'
import { passwordValidationMessage } from '../utils/passwordValidation'

const tabs = [
  ['departments', '部门'],
  ['users', '账号'],
  ['sessions', '在线会话'],
  ['audit', '登录与操作审计'],
  ['usage', '使用统计'],
]

const emptyUser = {
  email: '', username: '', display_name: '', temporary_password: '',
  role: 'user', department_id: '',
}

function minimumThreeCharacterMessage(value, { optional = false } = {}) {
  if (optional && !value) return ''
  return [...value].length < 3 ? '至少包含三个字符' : ''
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}

function formatSessionTime(value) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(({ type, value: partValue }) => [type, partValue]),
  )

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

function SessionTime({ value }) {
  const formatted = formatSessionTime(value)
  if (!formatted) return '—'

  return (
    <div className="whitespace-nowrap font-mono text-xs leading-5 tabular-nums">
      <div>{formatted.date}</div>
      <div>{formatted.time}</div>
    </div>
  )
}

function SelectableOverflowText({ children, className = '', title }) {
  return (
    <div
      className={`cursor-text select-text overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      title={title}
    >
      {children}
    </div>
  )
}

function errorMessage(error, fallback = '操作失败') {
  const detail = error.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('；')
  return detail || fallback
}

function TableShell({ columns, children, empty = false }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-glass">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-primary/50 text-xs uppercase tracking-wider text-tertiary">
          <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
      {empty && <div className="px-4 py-12 text-center text-sm text-tertiary">暂无数据</div>}
    </div>
  )
}

function DepartmentsView({ departments, reload }) {
  const [form, setForm] = useState({ code: '', name: '' })
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const create = async (event) => {
    event.preventDefault(); setSaving(true)
    try {
      await api.post('/api/admin/departments', form)
      setForm({ code: '', name: '' }); await reload()
      addToast({ type: 'success', message: '部门已创建' })
    } catch (error) { addToast({ type: 'error', message: errorMessage(error) }) }
    finally { setSaving(false) }
  }

  const toggle = async (department) => {
    try {
      await api.patch(`/api/admin/departments/${department.id}`, {
        status: department.status === 'active' ? 'disabled' : 'active',
      })
      await reload()
    } catch (error) { addToast({ type: 'error', message: errorMessage(error) }) }
  }

  return (
    <div className="space-y-4">
      <Card title="创建部门">
        <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={create}>
          <Input label="部门编码" value={form.code} onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))} required />
          <Input label="部门名称" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
          <Button type="submit" loading={saving}>创建</Button>
        </form>
      </Card>
      <Card title={`部门列表（${departments.length}）`}>
        <TableShell columns={['编码', '名称', '状态', '创建时间', '操作']} empty={!departments.length}>
          {departments.map((department) => (
            <tr key={department.id} className="text-secondary">
              <td className="px-4 py-3 font-mono text-xs text-primary">{department.code}</td>
              <td className="px-4 py-3 font-medium text-primary">{department.name}</td>
              <td className="px-4 py-3"><Badge variant={department.status === 'active' ? 'success' : 'neutral'}>{department.status === 'active' ? '启用' : '停用'}</Badge></td>
              <td className="px-4 py-3">{formatTime(department.created_at)}</td>
              <td className="px-4 py-3"><Button size="sm" variant="secondary" onClick={() => toggle(department)}>{department.status === 'active' ? '停用' : '启用'}</Button></td>
            </tr>
          ))}
        </TableShell>
      </Card>
    </div>
  )
}

function UsersView({ departments, users, meta, reload }) {
  const [form, setForm] = useState(emptyUser)
  const [createAttempted, setCreateAttempted] = useState(false)
  const [resetUser, setResetUser] = useState(null)
  const [deleteUser, setDeleteUser] = useState(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { addToast } = useToast()
  const departmentOptions = [{ value: '', label: '请选择部门' }, ...departments.filter((d) => d.status === 'active').map((d) => ({ value: String(d.id), label: d.name }))]
  const usernameError = form.username || createAttempted
    ? minimumThreeCharacterMessage(form.username)
    : ''
  const displayNameError = minimumThreeCharacterMessage(form.display_name, { optional: true })
  const passwordError = form.temporary_password || createAttempted
    ? passwordValidationMessage(form.temporary_password, { emptyMessage: '请输入临时密码' })
    : ''
  const departmentError = createAttempted && form.role === 'user' && !form.department_id
    ? '创建部门账号时必须选择一个具体部门'
    : ''

  const create = async (event) => {
    event.preventDefault()
    setCreateAttempted(true)
    if (
      minimumThreeCharacterMessage(form.username)
      || minimumThreeCharacterMessage(form.display_name, { optional: true })
      || passwordValidationMessage(form.temporary_password, { emptyMessage: '请输入临时密码' })
      || (form.role === 'user' && !form.department_id)
    ) return
    setSaving(true)
    try {
      await api.post('/api/admin/users', {
        ...form,
        display_name: form.display_name || null,
        department_id: form.role === 'user' ? Number(form.department_id) : null,
      })
      setForm(emptyUser); setCreateAttempted(false); await reload()
      addToast({ type: 'success', message: '账号已创建，首次登录将强制改密' })
    } catch (error) { addToast({ type: 'error', message: errorMessage(error) }) }
    finally { setSaving(false) }
  }

  const patchUser = async (user, values) => {
    try { await api.patch(`/api/admin/users/${user.id}`, values); await reload() }
    catch (error) { addToast({ type: 'error', message: errorMessage(error) }) }
  }

  const deleteAccount = async () => {
    if (!deleteUser) return
    setDeleting(true)
    try {
      await api.delete(`/api/admin/users/${deleteUser.id}`)
      setDeleteUser(null); await reload()
      addToast({ type: 'success', message: '账号已注销' })
    } catch (error) { addToast({ type: 'error', message: errorMessage(error) }) }
    finally { setDeleting(false) }
  }

  const resetPassword = async () => {
    if (!resetUser) return
    setSaving(true)
    try {
      await api.post(`/api/admin/users/${resetUser.id}/reset-password`, { temporary_password: temporaryPassword })
      setResetUser(null); setTemporaryPassword(''); await reload()
      addToast({ type: 'success', message: '临时密码已重置，全部会话已撤销' })
    } catch (error) { addToast({ type: 'error', message: errorMessage(error) }) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <Card title="创建账号">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={create}>
          <Input label="邮箱" type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} required />
          <Input label="用户名" value={form.username} onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))} error={usernameError} required />
          <Input label="显示名称" value={form.display_name} onChange={(e) => setForm((v) => ({ ...v, display_name: e.target.value }))} error={displayNameError} />
          <Input label="临时密码" type="password" value={form.temporary_password} onChange={(e) => setForm((v) => ({ ...v, temporary_password: e.target.value }))} error={passwordError} required />
          <Select label="账号类型" value={form.role} onChange={(role) => setForm((v) => ({ ...v, role, department_id: '' }))} options={[{ value: 'user', label: '部门账号' }, { value: 'manager', label: '管理员账号' }]} />
          {form.role === 'user' && <Select label="所属部门（必选）" value={form.department_id} onChange={(department_id) => setForm((v) => ({ ...v, department_id }))} options={departmentOptions} error={departmentError} required />}
          <div className="flex items-end"><Button className="w-full" type="submit" loading={saving}>创建账号</Button></div>
        </form>
      </Card>
      <Card title={`账号列表（${users.length}）`}>
        <TableShell columns={['账号', '权限', '部门', '状态', '最近登录', '操作']} empty={!users.length}>
          {users.map((user) => (
            <tr key={user.id} className="text-secondary">
              <td className="px-4 py-3"><div className="font-medium text-primary">{user.display_name || user.username}</div><div className="text-xs text-tertiary">{user.email}</div></td>
              <td className="px-4 py-3"><Badge variant={user.role === 'manager' ? 'warning' : 'neutral'}>{user.role === 'manager' ? '管理员账号' : `${user.department_name || '未分配部门'}账号`}</Badge>{user.must_change_password && <div className="mt-1 text-xs text-warning">待首次改密</div>}</td>
              <td className="px-4 py-3">{user.department_name || '全部部门'}</td>
              <td className="px-4 py-3"><Badge variant={user.status === 'active' ? 'success' : 'danger'}>{user.status === 'active' ? '启用' : '禁用'}</Badge></td>
              <td className="px-4 py-3">{formatTime(user.last_login_at)}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => patchUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })}>{user.status === 'active' ? '禁用' : '启用'}</Button><Button size="sm" variant="secondary" onClick={() => setResetUser(user)}>重置密码</Button><Button size="sm" variant="danger" onClick={() => setDeleteUser(user)}>注销账号</Button></div></td>
            </tr>
          ))}
        </TableShell>
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-tertiary">
          <span>第 {meta.page || 1} 页 · 共 {meta.total || 0} 个账号</span>
          <Button size="sm" variant="secondary" disabled={(meta.page || 1) <= 1} onClick={() => reload(meta.page - 1)}>上一页</Button>
          <Button size="sm" variant="secondary" disabled={(meta.page || 1) * (meta.size || 20) >= (meta.total || 0)} onClick={() => reload((meta.page || 1) + 1)}>下一页</Button>
        </div>
      </Card>
      <Modal isOpen={!!resetUser} onClose={() => setResetUser(null)} title={`重置 ${resetUser?.email || ''} 的密码`} actions={<><Button variant="secondary" onClick={() => setResetUser(null)}>取消</Button><Button loading={saving} onClick={resetPassword}>确认重置</Button></>}>
        <Input label="新临时密码" type="password" minLength={12} value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} />
        <p className="mt-3 text-xs leading-5 text-tertiary">重置后该账号的全部现有会话会立即失效，下一次登录必须修改密码。</p>
      </Modal>
      <Modal isOpen={!!deleteUser} onClose={() => { if (!deleting) setDeleteUser(null) }} title={`注销 ${deleteUser?.email || ''}`} actions={<><Button variant="secondary" disabled={deleting} onClick={() => setDeleteUser(null)}>取消</Button><Button variant="danger" loading={deleting} onClick={deleteAccount}>确认注销</Button></>}>
        <p className="leading-6">账号注销后将无法登录，全部在线会话也会立即失效。</p>
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">此操作不可撤销。历史审计和业务记录会保留，但不再关联可登录账号。</p>
      </Modal>
    </div>
  )
}

function SessionsView({ sessions, reload }) {
  const { addToast } = useToast()
  const revoke = async (session) => {
    try { await api.post(`/api/admin/sessions/${session.id}/revoke`); await reload() }
    catch (error) { addToast({ type: 'error', message: errorMessage(error) }) }
  }
  return <Card title={`会话列表（${sessions.filter((item) => item.active).length} 个有效）`}><TableShell columns={['账号', 'IP', '设备', '创建时间', '到期时间', '状态', '操作']} empty={!sessions.length}>{sessions.map((session) => <tr key={session.id} className="text-secondary"><td className="px-4 py-3 text-primary">{session.email}</td><td className="px-4 py-3 font-mono text-xs">{session.ip_address || '—'}</td><td className="w-72 max-w-xs px-4 py-3 text-xs"><SelectableOverflowText title={session.user_agent}>{session.user_agent || '—'}</SelectableOverflowText></td><td className="px-4 py-3"><SessionTime value={session.created_at} /></td><td className="px-4 py-3"><SessionTime value={session.expires_at} /></td><td className="px-4 py-3"><Badge variant={session.active ? 'success' : 'neutral'}>{session.active ? '有效' : '已结束'}</Badge></td><td className="px-4 py-3"><Button className="whitespace-nowrap" size="sm" variant="danger" disabled={!session.active} onClick={() => revoke(session)}>强制下线</Button></td></tr>)}</TableShell></Card>
}

function AuditView({ departments, users, audit, reload }) {
  const [filters, setFilters] = useState({ user_id: '', department_id: '', event_type: '', outcome: '', ip_address: '', from_time: '', to_time: '' })
  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')), [filters])
  const page = audit.meta?.page || 1
  const size = audit.meta?.size || 100
  return <div className="space-y-4"><Card title="审计筛选"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4"><Select label="账号" value={filters.user_id} onChange={(user_id) => setFilters((v) => ({ ...v, user_id }))} options={[{ value: '', label: '全部账号' }, ...users.map((u) => ({ value: String(u.id), label: u.email }))]} /><Select label="部门" value={filters.department_id} onChange={(department_id) => setFilters((v) => ({ ...v, department_id }))} options={[{ value: '', label: '全部部门' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]} /><Input label="事件前缀" value={filters.event_type} onChange={(e) => setFilters((v) => ({ ...v, event_type: e.target.value }))} placeholder="auth. / api. / activity." /><Select label="结果" value={filters.outcome} onChange={(outcome) => setFilters((v) => ({ ...v, outcome }))} options={[{ value: '', label: '全部结果' }, { value: 'success', label: '成功' }, { value: 'failure', label: '失败' }]} /><Input label="IP 地址" value={filters.ip_address} onChange={(e) => setFilters((v) => ({ ...v, ip_address: e.target.value }))} /><Input label="开始时间" type="datetime-local" value={filters.from_time} onChange={(e) => setFilters((v) => ({ ...v, from_time: e.target.value }))} /><Input label="结束时间" type="datetime-local" value={filters.to_time} onChange={(e) => setFilters((v) => ({ ...v, to_time: e.target.value }))} /><div className="flex items-end"><Button className="w-full" onClick={() => reload({ ...params, page: 1 })}>查询</Button></div></div></Card><Card title={`审计记录（${audit.meta?.total || 0}）`}><TableShell columns={['时间', '账号 ID', '部门 ID', '事件', '结果', 'IP / 设备', '页面 / API']} empty={!audit.items?.length}>{(audit.items || []).map((event) => <tr key={event.id} className="text-secondary"><td className="whitespace-nowrap px-4 py-3">{formatTime(event.created_at)}</td><td className="px-4 py-3">{event.actor_user_id || (event.subject_user_id ? `系统 → ${event.subject_user_id}` : '匿名')}</td><td className="px-4 py-3">{event.department_id || '—'}</td><td className="px-4 py-3 font-mono text-xs text-primary">{event.event_type}</td><td className="px-4 py-3"><Badge variant={event.outcome === 'success' ? 'success' : 'danger'}>{event.outcome}</Badge></td><td className="w-[220px] max-w-[220px] px-4 py-3"><div className="font-mono text-xs">{event.ip_address || '—'}</div><SelectableOverflowText className="text-xs text-tertiary" title={event.user_agent}>{event.user_agent || '—'}</SelectableOverflowText></td><td className="w-80 max-w-xs px-4 py-3"><SelectableOverflowText className="font-mono text-xs" title={`${event.method || ''} ${event.path || ''}`.trim()}>{event.method} {event.path}</SelectableOverflowText></td></tr>)}</TableShell><div className="mt-3 flex items-center justify-end gap-2 text-xs text-tertiary"><span>第 {page} 页</span><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => reload({ ...params, page: page - 1 })}>上一页</Button><Button size="sm" variant="secondary" disabled={page * size >= (audit.meta?.total || 0)} onClick={() => reload({ ...params, page: page + 1 })}>下一页</Button></div></Card></div>
}

function UsageView({ usage, reload }) {
  const [days, setDays] = useState('30')
  const totals = usage.reduce((sum, item) => ({ api: sum.api + item.api_requests, tokens: sum.tokens + item.total_tokens, calls: sum.calls + item.calls }), { api: 0, tokens: 0, calls: 0 })
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Card><div className="text-xs uppercase tracking-wider text-tertiary">API 请求</div><div className="mt-2 text-2xl font-semibold text-primary">{totals.api.toLocaleString()}</div></Card><Card><div className="text-xs uppercase tracking-wider text-tertiary">AI 调用</div><div className="mt-2 text-2xl font-semibold text-primary">{totals.calls.toLocaleString()}</div></Card><Card><div className="text-xs uppercase tracking-wider text-tertiary">Token</div><div className="mt-2 text-2xl font-semibold text-primary">{totals.tokens.toLocaleString()}</div></Card></div><Card title="账号与部门使用统计" actions={<div className="flex items-end gap-2"><Select value={days} onChange={setDays} options={[{ value: '7', label: '最近 7 天' }, { value: '30', label: '最近 30 天' }, { value: '90', label: '最近 90 天' }]} /><Button size="sm" variant="secondary" onClick={() => reload(days)}>刷新</Button></div>}><TableShell columns={['账号 / 部门', '最近活动', '有效会话', '页面 / API', '论文操作', 'AI / Token', '失败']} empty={!usage.length}>{usage.map((item) => <tr key={item.user_id ?? 'legacy'} className="text-secondary"><td className="px-4 py-3"><div className="text-primary">{item.email}</div><div className="text-xs text-tertiary">{item.department_name || '管理员账号 / 历史未归属'}</div></td><td className="px-4 py-3">{formatTime(item.last_activity_at)}</td><td className="px-4 py-3">{item.active_sessions}</td><td className="px-4 py-3">{item.page_views} / {item.api_requests}</td><td className="px-4 py-3">{item.paper_operations}</td><td className="px-4 py-3">{item.calls} / {Number(item.total_tokens).toLocaleString()}</td><td className="px-4 py-3">{item.failed_requests + item.error_count}</td></tr>)}</TableShell></Card></div>
}

export default function AccessControlPage() {
  const [activeTab, setActiveTab] = useState('departments')
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [userMeta, setUserMeta] = useState({ page: 1, size: 20, total: 0 })
  const [sessions, setSessions] = useState([])
  const [audit, setAudit] = useState({ items: [], meta: {} })
  const [usage, setUsage] = useState([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const loadDepartments = useCallback(async () => setDepartments((await api.get('/api/admin/departments')).data), [])
  const loadUsers = useCallback(async (page = 1) => {
    const { data } = await api.get('/api/admin/users', { params: { page, size: 20 } })
    setUsers(data.items); setUserMeta(data.meta)
  }, [])
  const loadSessions = useCallback(async () => setSessions((await api.get('/api/admin/sessions')).data), [])
  const loadAudit = useCallback(async (params = {}) => setAudit((await api.get('/api/admin/audit', { params: { size: 100, ...params } })).data), [])
  const loadUsage = useCallback(async (days = '30') => setUsage((await api.get('/api/admin/usage', { params: { days } })).data), [])

  useEffect(() => {
    Promise.all([loadDepartments(), loadUsers(), loadSessions(), loadAudit(), loadUsage()])
      .catch((error) => addToast({ type: 'error', message: errorMessage(error, '权限管理数据加载失败') }))
      .finally(() => setLoading(false))
  }, [addToast, loadAudit, loadDepartments, loadSessions, loadUsage, loadUsers])

  return (
    <div className="space-y-5 py-3 sm:py-5">
      <div><div className="panel-header-kicker">ACCESS CONTROL</div><h1 className="mt-2 font-display text-2xl font-semibold text-primary">权限管理</h1><p className="mt-1 text-sm text-secondary">管理部门、账号、在线会话、永久审计记录与使用统计。</p></div>
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-glass bg-primary/30 p-2" role="tablist" aria-label="权限管理视图">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === id ? 'bg-accent text-white shadow-glass' : 'text-secondary hover:bg-primary/60 hover:text-primary'}`}>{label}</button>)}
      </div>
      {loading ? <Card><div className="py-12 text-center text-sm text-tertiary">正在加载权限数据…</div></Card> : <>{activeTab === 'departments' && <DepartmentsView departments={departments} reload={loadDepartments} />}{activeTab === 'users' && <UsersView departments={departments} users={users} meta={userMeta} reload={loadUsers} />}{activeTab === 'sessions' && <SessionsView sessions={sessions} reload={loadSessions} />}{activeTab === 'audit' && <AuditView departments={departments} users={users} audit={audit} reload={loadAudit} />}{activeTab === 'usage' && <UsageView usage={usage} reload={loadUsage} />}</>}
    </div>
  )
}
