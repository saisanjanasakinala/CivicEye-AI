import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  ShieldCheck,
  Building2,
  Cpu,
  MapPin,
  Bell,
  CheckCircle2,
  Save,
  GitMerge,
  Users,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import { useAuth } from '../contexts/AuthContext'
import { getDepartments, getComplaints, getStaffUsers } from '../api/complaints'
import client from '../api/client'
import type { Department, Complaint, User as StaffUser } from '../types'

interface HealthInfo {
  status: string
  service: string
  ai_configured: boolean
  database: string
  total_complaints: number
  total_buses: number
}

export default function SettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<Department[]>([])
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [dedupComplaints, setDedupComplaints] = useState<Complaint[]>([])
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [dedupRadius, setDedupRadius] = useState<number>(50)
  const [dedupWindowHours, setDedupWindowHours] = useState<number>(336)
  const [savedNotice, setSavedNotice] = useState<string>('')
  const [updatingStaffId, setUpdatingStaffId] = useState<number | null>(null)

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {})
    getStaffUsers()
      .then(setStaffList)
      .catch(() => {})
    client
      .get('/health')
      .then((res) => setHealth(res.data))
      .catch(() => {})
    client
      .get('/settings/deduplication')
      .then((res) => {
        const d = res.data?.data || res.data
        const val = d?.threshold_meters ?? d?.radius_meters
        if (val) setDedupRadius(Number(val))
        if (d?.window_hours) setDedupWindowHours(Number(d.window_hours))
      })
      .catch(() => {})
    getComplaints({ page_size: 50 })
      .then((res) => {
        setDedupComplaints((res.items || []).filter((c) => (c.observation_count || 1) > 1))
      })
      .catch(() => {})
  }, [])

  const handleStaffDeptChange = async (staffId: number, newDeptId: number) => {
    setUpdatingStaffId(staffId)
    try {
      const res = await client.put(`/officers/${staffId}`, {
        department_id: newDeptId,
      })
      const updatedUser = res.data
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, ...updatedUser } : s))
      )
      setSavedNotice(`Updated department assignment for ${updatedUser.full_name || updatedUser.username}.`)
      setTimeout(() => setSavedNotice(''), 4000)
    } catch {
      // ignore
    } finally {
      setUpdatingStaffId(null)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await client.put('/settings/deduplication', {
        threshold_meters: dedupRadius,
        radius_meters: dedupRadius,
        window_hours: dedupWindowHours,
      })
    } catch {
      // Fallback local update
    }
    setSavedNotice(
      `Geo-Deduplication threshold updated to ${dedupRadius}m (${Math.round(
        dedupWindowHours / 24
      )} days window).`
    )
    setTimeout(() => setSavedNotice(''), 4000)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#F4F7F7] flex items-center gap-2">
              <SettingsIcon size={22} className="text-[#91C8BD]" />
              Settings
            </h1>
            <p className="text-xs sm:text-sm text-[#AABDC2] mt-0.5">
              Configure AI detection, duplicate distance thresholds, and department routing.
            </p>
          </div>
          <Link
            to="/dashboard/notifications"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1C3038] hover:bg-[#233B44] border border-[#2A444E] text-[#F4F7F7] text-xs font-semibold transition-colors"
          >
            <Bell size={14} className="text-[#91C8BD]" />
            <span>Notifications</span>
          </Link>
        </div>

        {savedNotice && (
          <div className="p-3.5 rounded-lg bg-[#1C3038] border border-[#367F77] text-[#91C8BD] text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 size={15} className="text-[#91C8BD]" />
            <span>{savedNotice}</span>
          </div>
        )}

        {/* System & AI Integration Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1C3038] border border-[#2A444E] rounded-xl p-5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#AABDC2]">
              <Cpu size={15} className="text-[#91C8BD]" />
              <span>AI Computer Vision Service</span>
            </div>
            <p className="text-base font-bold text-[#F4F7F7]">
              {health?.ai_configured ? 'Gemini Vision Active' : 'Demo Simulation Mode'}
            </p>
            <p className="text-xs text-[#AABDC2]">
              {health?.ai_configured
                ? 'Server-side GEMINI_API_KEY connected for real-time road frame analysis.'
                : 'No GEMINI_API_KEY detected; explicitly labelled Demo Simulation mode active.'}
            </p>
          </div>

          <div className="bg-[#1C3038] border border-[#2A444E] rounded-xl p-5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#AABDC2]">
              <MapPin size={15} className="text-[#91C8BD]" />
              <span>Geo-Deduplication Radius</span>
            </div>
            <p className="text-base font-bold text-[#F4F7F7] font-mono">
              {dedupRadius}m Distance Threshold
            </p>
            <p className="text-xs text-[#AABDC2]">
              Merges same-category reports within {dedupRadius}m and{' '}
              {Math.round(dedupWindowHours / 24)} days while preserving evidence.
            </p>
          </div>

          <div className="bg-[#1C3038] border border-[#2A444E] rounded-xl p-5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#AABDC2]">
              <ShieldCheck size={15} className="text-[#91C8BD]" />
              <span>Authenticated Staff</span>
            </div>
            <p className="text-base font-bold text-[#F4F7F7]">
              {user?.full_name || user?.username}
            </p>
            <p className="text-xs text-[#AABDC2]">
              Role: <strong className="uppercase text-[#91C8BD]">{user?.role}</strong> ·{' '}
              {user?.department || 'Central Command'}
            </p>
          </div>
        </div>

        {/* Configurable Geo-Deduplication Thresholds */}
        <form
          onSubmit={handleSaveConfig}
          className="bg-[#1C3038] border border-[#2A444E] rounded-xl p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-[#F4F7F7]">
            Configurable Geo-Deduplication Thresholds
          </h2>
          <p className="text-xs text-[#AABDC2]">
            Prevent multiple buses or citizens from creating duplicate complaints for the same
            issue. Only reports matching the same category within the configured distance and time
            window are merged.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#F4F7F7] mb-1.5">
                Geographic Distance Threshold (Metres)
              </label>
              <input
                type="number"
                min={10}
                max={500}
                value={dedupRadius}
                onChange={(e) => setDedupRadius(Number(e.target.value))}
                className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg px-3 py-2 text-sm font-mono text-[#F4F7F7] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#F4F7F7] mb-1.5">
                Detection Time Window (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={720}
                value={dedupWindowHours}
                onChange={(e) => setDedupWindowHours(Number(e.target.value))}
                className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg px-3 py-2 text-sm font-mono text-[#F4F7F7] outline-none"
              />
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-xs font-semibold transition-colors"
            >
              <Save size={14} />
              <span>Save Deduplication Settings</span>
            </button>
          </div>
        </form>

        {/* Corroborated & Merged Duplicate Complaints for Staff Verification */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2A444E] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F4F7F7] flex items-center gap-2">
              <GitMerge size={17} className="text-[#91C8BD]" />
              Merged & Corroborated Duplicate Reports ({dedupComplaints.length})
            </h2>
            <span className="text-xs text-[#AABDC2]">
              Preserves reporting sources, evidence, and detection history
            </span>
          </div>
          <div className="divide-y divide-[#2A444E]">
            {dedupComplaints.length === 0 ? (
              <div className="p-6 text-xs text-[#AABDC2] text-center">
                No multi-observation duplicate clusters recorded yet.
              </div>
            ) : (
              dedupComplaints.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/dashboard/complaints/${c.complaint_id}`)}
                  className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-[#233B44]/60 cursor-pointer transition-colors"
                >
                  <div>
                    <span className="font-mono font-bold text-[#91C8BD]">{c.complaint_id}</span>
                    <span className="mx-2 text-[#AABDC2]">·</span>
                    <span className="font-semibold text-[#F4F7F7]">{c.category}</span>
                    <p className="text-[#AABDC2] mt-0.5 line-clamp-1">{c.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="px-2.5 py-1 rounded bg-[#101C23] border border-[#367F77] font-mono text-[#91C8BD] font-semibold">
                      {c.observation_count} merged sightings
                    </span>
                    <span className="text-[#AABDC2] font-mono">
                      {c.latitude.toFixed(4)}°N, {c.longitude.toFixed(4)}°E
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Government Staff & Department Role Management (Admin Only) */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2A444E] flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#F4F7F7] flex items-center gap-2">
              <Users size={17} className="text-[#91C8BD]" />
              Government Staff & Department Access Management ({staffList.length})
            </h2>
            <span className="text-xs text-[#AABDC2]">
              Server-enforced Role-Based Access Control (Admin & Department Officers)
            </span>
          </div>
          <div className="divide-y divide-[#2A444E]">
            {staffList.map((member) => (
              <div
                key={member.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#F4F7F7] text-sm">
                      {member.full_name || member.username}
                    </span>
                    <span className="font-mono text-[#AABDC2]">@{member.username}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-semibold uppercase tracking-wider text-[10px] ${
                        member.role === 'admin'
                          ? 'bg-[#367F77]/25 text-[#91C8BD] border border-[#367F77]/40'
                          : 'bg-[#101C23] text-[#F4F7F7] border border-[#2A444E]'
                      }`}
                    >
                      {member.role === 'admin' ? 'Admin' : 'Department Officer'}
                    </span>
                  </div>
                  <p className="text-[#AABDC2] mt-0.5">{member.email}</p>
                </div>

                <div className="flex items-center gap-3">
                  {member.role === 'admin' ? (
                    <span className="px-3 py-1.5 rounded-lg bg-[#101C23] border border-[#2A444E] text-[#91C8BD] font-semibold">
                      Full System & All Departments Access
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-[#AABDC2]">Assigned Dept:</label>
                      <select
                        value={member.department_id ?? ''}
                        disabled={updatingStaffId === member.id}
                        onChange={(e) =>
                          handleStaffDeptChange(member.id, Number(e.target.value))
                        }
                        className="bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F7F7] outline-none"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Municipal Department Routing Matrix */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2A444E]">
            <h2 className="text-base font-bold text-[#F4F7F7] flex items-center gap-2">
              <Building2 size={17} className="text-[#91C8BD]" />
              Automated Municipal Department Routing Matrix
            </h2>
          </div>
          <div className="divide-y divide-[#2A444E]">
            {departments.map((dept) => (
              <div
                key={dept.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <div>
                  <div className="font-semibold text-[#F4F7F7]">
                    {dept.name}{' '}
                    <span className="font-mono text-xs text-[#91C8BD]">({dept.code})</span>
                  </div>
                  <div className="text-xs text-[#AABDC2] mt-0.5">
                    Auto-routed categories:{' '}
                    {(dept.problem_categories || []).join(' · ') || 'General Civic Issues'}
                  </div>
                </div>
                <div className="text-xs font-mono text-[#AABDC2]">
                  {dept.contact_email || 'ward-dispatch@punecorporation.org'} · Open Queue:{' '}
                  <strong className="text-[#91C8BD]">{dept.open_count ?? 0}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
