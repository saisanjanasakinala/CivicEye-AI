import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, Lock, User, AlertCircle, Shield, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import client from '../api/client'
import type { DemoStaffAccount } from '../types'
import LoadingSpinner from '../components/UI/LoadingSpinner'

const DEFAULT_DEMO_STAFF_ACCOUNTS: DemoStaffAccount[] = [
  {
    username: 'admin',
    label: 'Municipal Commissioner (Government Admin)',
    role: 'admin',
    role_label: 'Government Admin',
    department_id: null,
    department: 'All Departments (Roads, Sanitation, Drainage, Parks, Electrical)',
  },
]

export default function Login() {
  const { login, demoLogin } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [demoAccounts, setDemoAccounts] = useState<DemoStaffAccount[]>(DEFAULT_DEMO_STAFF_ACCOUNTS)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    client
      .get<DemoStaffAccount[]>('/auth/demo-accounts')
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setDemoAccounts(res.data)
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const loggedIn = await login(username, password)
      if (loggedIn.role !== 'admin' && loggedIn.role !== 'officer') {
        setError(
          'Access restricted to authorized Government Staff (Admin or Department Officer). Citizens can use the Citizen Portal without login.'
        )
        return
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          'Invalid staff username or password'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleStaffQuickLogin = async (staffUsername: string) => {
    setUsername(staffUsername)
    setPassword('')
    setError('')
    setIsLoading(true)
    try {
      await demoLogin(staffUsername)
      navigate('/dashboard')
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          'Staff authentication failed'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#101C23] text-[#F4F7F7] flex flex-col justify-between p-4">
      <div className="max-w-6xl w-full mx-auto pt-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#AABDC2] hover:text-[#F4F7F7] transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to CivicEye AI Homepage</span>
        </Link>
      </div>

      <div className="max-w-md w-full mx-auto bg-[#1C3038] border border-[#2A444E] rounded-xl p-6 sm:p-8 shadow-lg space-y-6 my-8">
        {/* Header */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-[#F4F7F7] font-bold text-lg">
            <Eye className="w-5 h-5 text-[#91C8BD]" />
            <span>CivicEye AI</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F4F7F7]">Government Staff Login</h1>
          <p className="text-xs text-[#AABDC2]">
            Unified portal for Municipal Administrators and Department Officers. Role and department permissions are enforced automatically by the server.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-950/60 border border-red-700/60 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#F4F7F7] mb-1.5">
              Staff Username
            </label>
            <div className="relative">
              <User
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AABDC2]"
              />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#F4F7F7] outline-none"
                placeholder="Enter staff username (e.g. admin, officer1)"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#F4F7F7] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AABDC2]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#F4F7F7] outline-none"
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <LoadingSpinner size="sm" /> : <Shield size={16} />}
            <span>Sign In to Command Center</span>
          </button>
        </form>

        {/* Staff Evaluation Accounts */}
        <div className="pt-4 border-t border-[#2A444E] space-y-2.5">
          <p className="text-xs text-[#AABDC2] font-semibold">
            Hackathon Demo — Government Admin Login
          </p>
          <p className="text-[11px] text-[#AABDC2]">
            One unified Government Admin login manages the Command Center. Roads & Infrastructure, Sanitation & Waste, Drainage, Parks, and Electrical are complaint assignment departments inside the dashboard.
          </p>
          <div className="space-y-2">
            {demoAccounts.map((acc) => (
              <button
                key={acc.username}
                type="button"
                disabled={isLoading}
                onClick={() => handleStaffQuickLogin(acc.username)}
                className="w-full p-2.5 rounded-lg bg-[#101C23] hover:bg-[#233B44] border border-[#2A444E] text-left transition-colors flex items-center justify-between gap-2 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#F4F7F7] block truncate">
                    {acc.label}
                  </span>
                  <span className="text-[11px] text-[#AABDC2] block truncate">
                    {acc.role_label} · {acc.department}
                  </span>
                </div>
                <span className="text-xs text-[#91C8BD] font-mono shrink-0">
                  {acc.username}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="text-center pt-2 border-t border-[#2A444E]">
          <Link
            to="/citizen"
            className="text-xs font-medium text-[#91C8BD] hover:text-[#F4F7F7] hover:underline"
          >
            Citizen reporting an issue? Open Citizen Portal (No Login Required)
          </Link>
        </div>
      </div>

      <div className="text-center text-xs text-[#AABDC2] pb-2">
        CivicEye AI · Server-Enforced Role & Department Access Control
      </div>
    </div>
  )
}
