import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import type { MapComplaint, ComplaintSeverity, ComplaintStatus } from '../../types'
import { categoryLabel, categoryEmoji } from '../../utils/categoryHelpers'

const severityColors: Record<ComplaintSeverity, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
}

const statusColors: Record<ComplaintStatus, string> = {
  new: '#3b82f6',
  assigned: '#6366f1',
  in_progress: '#f59e0b',
  awaiting_verification: '#a855f7',
  resolved: '#10b981',
  closed: '#64748b',
}

function createMarkerIcon(severity: ComplaintSeverity, status: ComplaintStatus) {
  const bgColor = status === 'resolved' || status === 'closed'
    ? statusColors[status]
    : severityColors[severity]

  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${bgColor};
      border:3px solid rgba(255,255,255,0.6);
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
      font-size:12px;
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

interface ComplaintMarkerProps {
  complaint: MapComplaint
  onClick?: (complaint: MapComplaint) => void
}

export default function ComplaintMarker({ complaint, onClick }: ComplaintMarkerProps) {
  const icon = createMarkerIcon(complaint.severity, complaint.status)

  return (
    <Marker
      position={[complaint.latitude, complaint.longitude]}
      icon={icon}
      eventHandlers={{ click: () => onClick?.(complaint) }}
    >
      <Popup>
        <div className="min-w-[200px]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{categoryEmoji(complaint.category)}</span>
            <div>
              <div className="font-semibold text-white text-sm">#{complaint.id}</div>
              <div className="text-slate-400 text-xs">{categoryLabel(complaint.category)}</div>
            </div>
          </div>
          <p className="text-slate-300 text-xs mb-2 line-clamp-2">{complaint.description}</p>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: `${severityColors[complaint.severity]}33`,
                color: severityColors[complaint.severity],
              }}
            >
              {complaint.severity}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: `${statusColors[complaint.status]}33`,
                color: statusColors[complaint.status],
              }}
            >
              {complaint.status.replace('_', ' ')}
            </span>
          </div>
          <Link
            to={`/dashboard/complaints/${complaint.id}`}
            className="text-teal-400 text-xs hover:underline"
          >
            View Details →
          </Link>
        </div>
      </Popup>
    </Marker>
  )
}
