import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const DEMO_CREDENTIALS = [
  { username: 'admin', password: 'admin123', role: 'Admin', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { username: 'officer1', password: 'pass123', role: 'Officer', color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
  { username: 'citizen1', password: 'pass123', role: 'Citizen', color: 'text-teal-400 border-teal-500/30 bg-teal-500/10' },
]

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr?.response?.data?.detail ?? 'Invalid credentials. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const fillDemo = (cred: typeof DEMO_CREDENTIALS[0]) => {
    setUsername(cred.username)
    setPassword(cred.password)
    setError('')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-slate-900 to-navy-900 p-12 border-r border-slate-800">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 bg-teal-500 rounded-xl flex items-center justify-center">
            <Eye size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white">CivicEye AI</div>
            <div className="text-teal-400 text-xs">Smart City Inspector</div>
          </div>
        </Link>

        <div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Every Bus Becomes a<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
              Smart City Inspector
            </span>
          </h2>
          <p className="text-slate-400 mb-8">
            AI-powered infrastructure monitoring for Pune's PMPML bus fleet.
            Detect, report, and resolve civic issues faster than ever.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {['1,247+ Issues Detected', '89% Resolution Rate', '12 Active Buses', '5 Departments'].map((s) => (
              <div key={s} className="flex items-center gap-2 text-slate-400 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                {s}
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs">© 2024 CivicEye AI · Pune, Maharashtra</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 bg-teal-500 rounded-xl flex items-center justify-center">
              <Eye size={18} className="text-white" />
            </div>
            <span className="font-bold text-white text-xl">CivicEye AI</span>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
              <p className="text-slate-400 text-sm">Sign in to access the dashboard</p>
            </div>

            {/* Demo credentials */}
            <div className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs font-medium uppercase tracking-wide">
                <Shield size={12} />
                Demo Credentials
              </div>
              <div className="space-y-2">
                {DEMO_CREDENTIALS.map((cred) => (
                  <button
                    key={cred.username}
                    type="button"
                    onClick={() => fillDemo(cred)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-700 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-700/50 transition-all text-left group"
                  >
                    <div className="text-sm">
                      <span className="text-white font-medium">{cred.username}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-slate-400">{cred.password}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cred.color}`}>
                      {cred.role}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-slate-600 text-xs mt-2">Click a row to auto-fill credentials</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Enter username"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 outline-none transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter password"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 rounded-lg px-4 py-2.5 pr-10 text-white placeholder-slate-500 outline-none transition-colors text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-semibold transition-colors"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn size={16} />
                )}
                {isLoading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>

          <p className="text-center text-slate-600 text-xs mt-4">
            <Link to="/" className="text-slate-500 hover:text-slate-300 transition-colors">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
