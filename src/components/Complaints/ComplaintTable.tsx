import { Link } from 'react-router-dom'
import type { Complaint } from '../../types'
import StatusBadge from './StatusBadge'
import Badge from '../UI/Badge'
import { categoryEmoji, categoryLabel, severityVariant, severityLabel } from '../../utils/categoryHelpers'
import { safeFormatDistanceToNow } from '../../utils/dateHelpers'
import { MapPin, ExternalLink } from 'lucide-react'

interface ComplaintTableProps {
  complaints: Complaint[]
  onRowClick?: (id: string | number) => void
}

export default function ComplaintTable({ complaints, onRowClick }: ComplaintTableProps) {
  if (!complaints || complaints.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-lg mb-1">No complaints found</p>
        <p className="text-sm">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 text-slate-400 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left">ID</th>
            <th className="px-4 py-3 text-left">Category</th>
            <th className="px-4 py-3 text-left">Location</th>
            <th className="px-4 py-3 text-left">Severity</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Department</th>
            <th className="px-4 py-3 text-left">Detected</th>
            <th className="px-4 py-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((complaint) => {
            const deptDisplay =
              typeof complaint.department === 'object' && complaint.department !== null
                ? (complaint.department as any).name
                : complaint.department || (complaint as any).department_name || '—'

            const locDisplay = complaint.address
              ? complaint.address.slice(0, 30) + (complaint.address.length > 30 ? '…' : '')
              : typeof complaint.latitude === 'number' && typeof complaint.longitude === 'number'
              ? `${complaint.latitude.toFixed(4)}, ${complaint.longitude.toFixed(4)}`
              : 'Pune'

            const targetId = complaint.complaint_id || complaint.id

            return (
              <tr
                key={complaint.id}
                className="border-b border-slate-700/20 hover:bg-[#243D47]/60 transition-colors cursor-pointer"
                onClick={() => onRowClick?.(targetId)}
              >
                <td className="px-4 py-3 text-[#00D1FF] font-mono text-xs font-semibold">
                  <Link
                    to={`/dashboard/complaints/${encodeURIComponent(String(targetId))}?from=all_complaints`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                  >
                    {complaint.complaint_id || `#${complaint.id}`}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="text-base">{categoryEmoji(complaint.category)}</span>
                    <span className="text-slate-300">{categoryLabel(complaint.category)}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-slate-400 text-xs">
                    <MapPin size={11} className="flex-shrink-0" />
                    {locDisplay}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={severityVariant(complaint.severity)}>
                    {severityLabel(complaint.severity)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={complaint.status} dot />
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {deptDisplay}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {safeFormatDistanceToNow(complaint.first_detected_at)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/dashboard/complaints/${complaint.complaint_id || complaint.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-teal-400 hover:text-teal-300 flex items-center gap-1 text-xs"
                  >
                    <ExternalLink size={12} />
                    View
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

