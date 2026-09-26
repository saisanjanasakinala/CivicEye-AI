import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapComplaint } from '../../types'
import ComplaintMarker from './ComplaintMarker'

// Fix Leaflet default icon URLs broken by Vite bundling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface CityMapProps {
  complaints: MapComplaint[]
  height?: string
  center?: [number, number]
  zoom?: number
  onMarkerClick?: (complaint: MapComplaint) => void
}

function FlyToCenter({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

const PUNE_CENTER: [number, number] = [18.5204, 73.8567]

export default function CityMap({
  complaints,
  height = '500px',
  center = PUNE_CENTER,
  zoom = 12,
  onMarkerClick,
}: CityMapProps) {
  return (
    <div style={{ height }} className="w-full rounded-lg overflow-hidden border border-slate-700/50">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToCenter center={center} />
        {complaints.map((complaint) => (
          <ComplaintMarker
            key={complaint.id}
            complaint={complaint}
            onClick={onMarkerClick}
          />
        ))}
      </MapContainer>
    </div>
  )
}
