import { Link } from 'react-router-dom'
import { MapPin, Bus, Clock } from 'lucide-react'
import type { Complaint } from '../../types'
import StatusBadge from './StatusBadge'
import Badge from '../UI/Badge'
import { categoryLabel, categoryEmoji, severityVariant, severityLabel } from '../../utils/categoryHelpers'
import { safeFormatDistanceToNow } from '../../utils/dateHelpers'

interface ComplaintCardProps {
  complaint: Complaint
}

export default function ComplaintCard({ complaint }: ComplaintCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 card-hover">
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0">{categoryEmoji(complaint.category)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-white font-semibold text-sm">{complaint.complaint_id || `#${complaint.id}`}</span>
            <StatusBadge status={complaint.status} dot />
            <Badge variant={severityVariant(complaint.severity)}>
              {severityLabel(complaint.severity)}
            </Badge>
          </div>
          <p className="text-slate-400 text-xs mb-2 truncate">{categoryLabel(complaint.category)}</p>
          <p className="text-slate-300 text-sm line-clamp-2 mb-3">{complaint.description}</p>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            {complaint.address && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {complaint.address}
              </span>
            )}
            {complaint.bus_id && (
              <span className="flex items-center gap-1">
                <Bus size={11} />
                Bus #{complaint.bus_id}
              </span>
            )}
            <span className="flex items-center gap-1 ml-auto">
              <Clock size={11} />
              {safeFormatDistanceToNow(complaint.first_detected_at)}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-700/30 flex justify-end">
        <Link
          to={`/dashboard/complaints/${complaint.complaint_id || complaint.id}`}
          className="text-teal-400 hover:text-teal-300 text-xs font-medium transition-colors"
        >
          View Details →
        </Link>
      </div>
    </div>
  )
}
