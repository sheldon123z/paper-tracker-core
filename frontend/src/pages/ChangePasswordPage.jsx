import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '../api'
import { Button, Card, Input } from '../components/ui'
import useStore from '../store'
import { passwordValidationMessage } from '../utils/passwordValidation'

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const { user, setUser, clearAuth } = useStore()
  const navigate = useNavigate()
  const newPasswordError = form.new_password || submitAttempted
    ? passwordValidationMessage(form.new_password, { emptyMessage: '请输入新密码' })
    : ''

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitAttempted(true)
    if (passwordValidationMessage(form.new_password, { emptyMessage: '请输入新密码' })) return
    if (form.new_password !== form.confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setUser({ ...user, must_change_password: false })
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '密码修改失败')
    } finally {
      setSaving(false)
    }
  }

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch { /* session may already be gone */ }
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary px-4 py-8">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <div className="mb-6">
          <div className="panel-header-kicker">ACCOUNT SECURITY</div>
          <h1 className="mt-2 font-display text-2xl font-semibold text-primary">首次登录，请修改密码</h1>
          <p className="mt-2 text-sm leading-6 text-secondary">
            当前账号使用管理员分配的临时密码。完成修改前，只能访问账号信息、改密和退出接口。
          </p>
        </div>
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
        <form className="space-y-4" onSubmit={submit}>
          <Input
            label="当前临时密码"
            type="password"
            autoComplete="current-password"
            value={form.current_password}
            onChange={(event) => setForm((value) => ({ ...value, current_password: event.target.value }))}
            required
          />
          <Input
            label="新密码"
            type="password"
            autoComplete="new-password"
            value={form.new_password}
            onChange={(event) => setForm((value) => ({ ...value, new_password: event.target.value }))}
            error={newPasswordError}
            required
          />
          <Input
            label="确认新密码"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(event) => setForm((value) => ({ ...value, confirm: event.target.value }))}
            required
          />
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={logout}>退出登录</Button>
            <Button type="submit" loading={saving}>保存新密码</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
