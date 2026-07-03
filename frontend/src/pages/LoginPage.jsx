import LoginAmbientScene from '../components/auth/LoginAmbientScene'
import LoginForm from '../components/auth/LoginForm'
import '../styles/login.css'

/**
 * Full-screen login page — "Academic Grid FUI" style.
 * Does NOT use the app's Sidebar or TabBar layout.
 * Desktop: 54/46 split-screen.  Tablet/Mobile: vertical stack.
 */
export default function LoginPage() {
  return (
    <div className="login-page">
      {/* Background layers */}
      <div className="login-bg" />
      <div className="login-grid-overlay" />
      <div className="login-fog" />

      {/* Content */}
      <div className="login-container">
        <LoginAmbientScene />
        <div className="login-card-zone">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
