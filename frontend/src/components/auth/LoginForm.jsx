import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import useStore from '../../store'

const registrationEnabled = import.meta.env.VITE_ALLOW_PUBLIC_REGISTRATION === '1'

/**
 * Glass login/register card with mode toggle.
 * Academic Grid FUI style — glass morphism, cyan glow, and local system fonts.
 */
export default function LoginForm() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Form fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const navigate = useNavigate()
  const setAuth = useStore((s) => s.setAuth)

  const resetForm = () => {
    setError(null)
    setSuccess(null)
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    resetForm()
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Login sets httpOnly cookies; user info is in response body
      const res = await api.post('/api/auth/login', { email, password })
      const userData = res.data.user
      setAuth(userData)
      navigate(userData.must_change_password ? '/change-password' : '/', { replace: true })
    } catch (err) {
      const detail = err.response?.data?.detail || '认证失败，请检查您的凭据。'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  // 密码强度验证：至少12个字符（UTF-8 字节不超过72），字符类别由后端校验
  const validatePasswordStrength = (pwd) => {
    if (pwd.length < 12) {
      return '密码长度不足，至少需要12个字符'
    }
    // bcrypt 72-byte limit: reject passwords whose UTF-8 encoding exceeds 72 bytes
    if (new TextEncoder().encode(pwd).length > 72) {
      return '密码过长，UTF-8 编码不能超过 72 字节'
    }
    return null
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const strengthError = validatePasswordStrength(password)
    if (strengthError) {
      setError(strengthError)
      return
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/register', {
        email,
        username,
        password,
        display_name: displayName || undefined,
      })
      // Auto-login after registration (cookies set by backend)
      const loginRes = await api.post('/api/auth/login', { email, password })
      const userData = loginRes.data.user
      setAuth(userData)
      navigate('/', { replace: true })
    } catch (err) {
      const detail = err.response?.data?.detail || '注册失败，请重试。'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-glass-card">
      {/* Brand header */}
      <div className="login-brand">
        <div className="login-brand-left">
          <div className="login-brand-logo">
            <LogoMark />
          </div>
          <span className="login-brand-name">专业领域大模型智能文献检索与知识服务</span>
        </div>
        <div className="login-status-capsule">
          <span className="login-status-dot" />
          节点已加密
        </div>
      </div>

      {/* Mode toggle */}
      {registrationEnabled && <div className="login-mode-toggle">
        <button
          type="button"
          className={`login-mode-btn ${mode === 'login' ? 'active' : ''}`}
          onClick={() => switchMode('login')}
        >
          登录
        </button>
        <button
          type="button"
          className={`login-mode-btn ${mode === 'register' ? 'active' : ''}`}
          onClick={() => switchMode('register')}
        >
          注册
        </button>
      </div>}

      {/* Title */}
      <h2 className="login-card-title">
        {mode === 'login' ? '欢迎回来' : '创建账户'}
      </h2>
      <p className="login-card-sub">
        {mode === 'login'
          ? '访问您的私有研究数据库'
          : '搭建您的专属研究工作区'}
      </p>

      {/* Error message */}
      {error && (
        <div className="login-error">
          <AlertIcon className="login-error-icon" />
          <div className="login-error-text">
            <strong>认证失败</strong>
            {error}
          </div>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="login-success">
          <CheckIcon className="login-success-icon" />
          <div className="login-success-text">{success}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
        {/* Email */}
        <div className="login-field">
          <label className="login-label" htmlFor="login-email">
            邮箱
          </label>
          <div className="login-input-wrap">
            <UserIcon className="login-input-icon" />
            <input
              id="login-email"
              type="email"
              className="login-input"
              placeholder="researcher@example.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
        </div>

        {/* Username (register only) */}
        {mode === 'register' && (
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">
              用户名
            </label>
            <div className="login-input-wrap">
              <AtIcon className="login-input-icon" />
              <input
                id="login-username"
                type="text"
                className="login-input"
                placeholder="您的用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                minLength={3}
                maxLength={64}
              />
            </div>
          </div>
        )}

        {/* Display Name (register only, optional) */}
        {mode === 'register' && (
          <div className="login-field">
            <label className="login-label" htmlFor="login-display-name">
              显示名称 <span style={{ opacity: 0.5, textTransform: 'none' }}>(选填)</span>
            </label>
            <div className="login-input-wrap">
              <BadgeIcon className="login-input-icon" />
              <input
                id="login-display-name"
                type="text"
                className="login-input"
                placeholder="您的昵称"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
          </div>
        )}

        {/* Password */}
        <div className="login-field">
          <label className="login-label" htmlFor="login-password">
            密码
          </label>
          <div className="login-input-wrap">
            <KeyIcon className="login-input-icon" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className="login-input"
              placeholder={mode === 'register' ? '至少 12 位，包含大小写字母、数字和特殊字符中的至少 3 类' : '请输入密码'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 12 : undefined}
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              className="login-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {/* Confirm Password (register only) */}
        {mode === 'register' && (
          <div className="login-field">
            <label className="login-label" htmlFor="login-confirm-password">
              确认密码
            </label>
            <div className="login-input-wrap">
              <KeyIcon className="login-input-icon" />
              <input
                id="login-confirm-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={12}
              />
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="login-btn-primary"
          disabled={loading}
        >
          {loading && <span className="login-btn-spinner" />}
          {mode === 'login' ? '进入工作区' : '创建账户'}
        </button>
      </form>

      {/* Security footer */}
      <div className="login-security-footer">
        <ShieldIcon className="login-security-icon" />
        <span className="login-security-text">
          您的论文、笔记和 Agent 会话均存储在您的私有数据库中。
        </span>
      </div>
    </div>
  )
}

/* ---- Inline SVG Icons (Lucide-style) ---- */

function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      {/* Central node */}
      <circle cx="16" cy="16" r="4" fill="#63D1FF" opacity="0.9" />
      <circle cx="16" cy="16" r="6.5" stroke="#63D1FF" strokeWidth="1" opacity="0.3" />
      {/* Radial lines */}
      <line x1="16" y1="9" x2="16" y2="3" stroke="#63D1FF" strokeWidth="1.2" opacity="0.5" />
      <line x1="22" y1="13" x2="27" y2="8" stroke="#63D1FF" strokeWidth="1.2" opacity="0.5" />
      <line x1="22" y1="19" x2="27" y2="24" stroke="#63D1FF" strokeWidth="1.2" opacity="0.5" />
      <line x1="10" y1="19" x2="5" y2="24" stroke="#63D1FF" strokeWidth="1.2" opacity="0.5" />
      {/* Paper node (top-right) */}
      <rect x="25" y="4" width="5" height="6" rx="1" fill="#62F5C2" opacity="0.6" />
      <line x1="26.5" y1="6" x2="28.5" y2="6" stroke="#0A1A2F" strokeWidth="0.8" />
      <line x1="26.5" y1="8" x2="28.5" y2="8" stroke="#0A1A2F" strokeWidth="0.8" />
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  )
}

function AtIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  )
}

function BadgeIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="13" y2="13" />
    </svg>
  )
}

function KeyIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.3 9.3" />
      <path d="M18.5 5.5l-2-2" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  )
}

function AlertIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}
