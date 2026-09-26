import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Upload, MapPin, Send, AlertCircle, CheckCircle2, Shield } from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import ComplaintCard from '../components/Complaints/ComplaintCard'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { createComplaint, getComplaints } from '../api/complaints'
import type { Complaint, ComplaintCategory } from '../types'
import { categoryLabel } from '../utils/categoryHelpers'
import { useAuth } from '../contexts/AuthContext'

const CATEGORIES: ComplaintCategory[] = [
  'pothole', 'garbage', 'dustbin', 'fallen_tree', 'waterlogging', 'streetlight', 'other',
]

const PUNE_CENTER: [number, number] = [18.5204, 73.8567]

function LocationPicker({
  position,
  onSelect,
}: {
  position: [number, number] | null
  onSelect: (pos: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      onSelect([e.latlng.lat, e.latlng.lng])
    },
  })

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#14b8a6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })

  return position ? <Marker position={position} icon={icon} /> : null
}

export default function CitizenPortal() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'submit' | 'my-complaints'>('submit')
  const [myComplaints, setMyComplaints] = useState<Complaint[]>([])
  const [isLoadingComplaints, setIsLoadingComplaints] = useState(false)

  // Form state
  const [category, setCategory] = useState<ComplaintCategory>('pothole')
  const [description, setDescription] = useState('')
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadMyComplaints = useCallback(async () => {
    setIsLoadingComplaints(true)
    try {
      const data = await getComplaints({ page_size: 50 })
      setMyComplaints(data.items ?? [])
    } catch {
      setMyComplaints([])
    } finally {
      setIsLoadingComplaints(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'my-complaints') loadMyComplaints()
  }, [tab, loadMyComplaints])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!position) {
      setSubmitError('Please select a location on the map')
      return
    }
    setIsSubmitting(true)
    setSubmitError('')
    try {
      await createComplaint({
        category,
        description,
        latitude: position[0],
        longitude: position[1],
        severity: 'medium',
      })
      setSubmitSuccess(true)
      setDescription('')
      setPosition(null)
      setImageFile(null)
      setImagePreview(null)
      setTimeout(() => setSubmitSuccess(false), 5000)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setSubmitError(e?.response?.data?.detail ?? 'Submission failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-5xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-white">Citizen Portal</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Report civic issues and track your complaints
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-700/50">
          {(['submit', 'my-complaints'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-teal-400 text-teal-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {t === 'submit' ? 'Submit Complaint' : 'My Complaints'}
            </button>
          ))}
        </div>

        {tab === 'submit' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h2 className="font-semibold text-white mb-4">Report an Issue</h2>

              {submitSuccess && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-center gap-2 text-sm">
                  <CheckCircle2 size={16} />
                  Complaint submitted successfully! It has been routed to the relevant department.
                </div>
              )}

              {submitError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg flex items-center gap-2 text-sm">
                  <AlertCircle size={16} />
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5 font-medium">
                    Issue Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 rounded-lg px-3 py-2 text-white text-sm outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{categoryLabel(c)}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5 font-medium">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    placeholder="Describe the issue in detail…"
                    rows={4}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 rounded-lg px-3 py-2 text-white placeholder-slate-500 outline-none text-sm resize-none"
                  />
                </div>

                {/* Image upload */}
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5 font-medium">
                    Photo (optional)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-36 object-cover rounded-lg border border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null) }}
                        className="absolute top-2 right-2 bg-slate-900/80 text-white p-1 rounded-full hover:bg-slate-800"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-24 border-2 border-dashed border-slate-600 hover:border-teal-500 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:text-teal-400 transition-colors text-sm gap-1"
                    >
                      <Upload size={20} />
                      Click to upload photo
                    </button>
                  )}
                </div>

                {/* Location indicator */}
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5 font-medium">
                    Location
                    <span className="text-slate-500 font-normal ml-1">(click on map to select)</span>
                  </label>
                  {position ? (
                    <div className="flex items-center gap-2 text-teal-400 text-sm bg-teal-500/10 border border-teal-500/20 rounded-lg px-3 py-2">
                      <MapPin size={14} />
                      {position[0].toFixed(5)}°N, {position[1].toFixed(5)}°E
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 text-sm bg-slate-700/30 border border-slate-700 rounded-lg px-3 py-2">
                      <MapPin size={14} />
                      No location selected
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !position}
                  className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-semibold transition-colors"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {isSubmitting ? 'Submitting…' : 'Submit Complaint'}
                </button>
              </form>

              {/* Privacy notice */}
              <div className="mt-4 p-3 bg-slate-700/30 rounded-lg flex gap-2 text-xs text-slate-500">
                <Shield size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
                <div>
                  Your complaint data is used only for civic issue resolution.
                  Location and photos are shared with the relevant municipal department.
                </div>
              </div>
            </div>

            {/* Map picker */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <MapPin size={14} className="text-teal-400" />
                  Select Location
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">Click anywhere on the map to mark the issue location</p>
              </div>
              <div style={{ height: '420px' }}>
                <MapContainer
                  center={PUNE_CENTER}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationPicker position={position} onSelect={setPosition} />
                </MapContainer>
              </div>
            </div>
          </div>
        ) : (
          /* My Complaints */
          <div>
            {isLoadingComplaints ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : myComplaints.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <CheckCircle2 size={40} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium text-slate-400">No complaints submitted yet</p>
                <p className="text-sm mt-1">Submit an issue from the Submit Complaint tab</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myComplaints.map((c) => (
                  <ComplaintCard key={c.id} complaint={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
