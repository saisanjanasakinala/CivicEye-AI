import React, { useEffect, useRef, useState } from 'react'
import { TileLayer, Marker, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Plus, Minus, Navigation, Search, MapPin, Loader2 } from 'lucide-react'
import client from '../../api/client'

export const DEFAULT_CITY_CENTER: [number, number] = [18.5204, 73.8567]
export const DEFAULT_CITY_ZOOM = 12
export const STREET_LEVEL_ZOOM = 17

// Custom high-visibility SVG Pin Icon for selected complaint location
export const selectedPinIcon = L.divIcon({
  className: 'civiceye-selected-pin',
  html: `
    <div style="position:relative;width:32px;height:42px;display:flex;align-items:center;justify-content:center;">
      <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.45));">
        <path d="M16 0C7.163 0 0 7.163 0 16C0 27.2 16 42 16 42C16 42 32 27.2 32 16C32 7.163 24.837 0 16 0Z" fill="#367F77"/>
        <path d="M16 1.5C24.008 1.5 30.5 7.992 30.5 16C30.5 25.84 17.85 38.07 16 39.88C14.15 38.07 1.5 25.84 1.5 16C1.5 7.992 7.992 1.5 16 1.5Z" stroke="#91C8BD" stroke-width="2"/>
        <circle cx="16" cy="15" r="6" fill="#F4F7F7"/>
      </svg>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -38],
})

/**
 * Ensures:
 * 1. Mouse-wheel zoom is completely disabled so scrolling over the map scrolls the page normally.
 * 2. Direct mouse/finger dragging is always enabled without a separate hand button.
 * 3. Leaflet recalculates container dimensions after mount, tab switches, and actual size changes to prevent missing tiles without interrupting zoom animations.
 */
export function MapInvalidator({ trigger }: { trigger?: unknown }) {
  const map = useMap()

  useEffect(() => {
    // Strictly disable mouse-wheel zoom so page scrolling works normally over the map
    if (map.scrollWheelZoom) {
      map.scrollWheelZoom.disable()
    }
    // Ensure direct mouse/touch dragging is enabled
    if (map.dragging) {
      map.dragging.enable()
    }

    const container = map.getContainer()
    let lastW = container?.clientWidth || 0
    let lastH = container?.clientHeight || 0

    const invalidate = (force = false) => {
      try {
        const w = container?.clientWidth || 0
        const h = container?.clientHeight || 0
        if (force || w !== lastW || h !== lastH) {
          lastW = w
          lastH = h
          map.invalidateSize({ animate: false, pan: false })
        }
      } catch {
        // ignore if map unmounted
      }
    }

    invalidate(true)
    const t1 = setTimeout(() => invalidate(true), 60)
    const t2 = setTimeout(() => invalidate(false), 250)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && container) {
      observer = new ResizeObserver(() => {
        invalidate(false)
      })
      observer.observe(container)
    }

    const onWinResize = () => invalidate(true)
    window.addEventListener('resize', onWinResize)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      if (observer) observer.disconnect()
      window.removeEventListener('resize', onWinResize)
    }
  }, [map, trigger])

  return null
}

/**
 * HTTPS OpenStreetMap TileLayer with subdomains and automatic fallback to CartoDB Voyager OSM tiles
 * if any individual tile request fails, preventing black or missing tile rectangles.
 */
export function SafeTileLayer() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      subdomains={['a', 'b', 'c']}
      maxZoom={19}
      keepBuffer={4}
      updateWhenIdle={false}
      updateWhenZooming={true}
      eventHandlers={{
        tileerror: (event: any) => {
          const img = event?.tile as HTMLImageElement | undefined
          const coords = event?.coords
          if (img && coords && !img.dataset.fallbackApplied) {
            img.dataset.fallbackApplied = 'true'
            img.src = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${coords.z}/${coords.x}/${coords.y}.png`
          }
        },
      }}
    />
  )
}

/**
 * Handles:
 * 1. Manual map click: places/moves the marker accurately at the clicked lat/lng WITHOUT changing the current zoom level.
 * 2. Auto-zoom (flyTarget): when a location is selected through GPS or address search, centers the map on that location at street-level zoom.
 */
export function MapInteractiveController({
  flyTarget,
  onMapClick,
}: {
  flyTarget: { lat: number; lng: number; zoom?: number; seq: number } | null
  onMapClick?: (lat: number, lng: number) => void
}) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (onMapClick) {
        // Place marker accurately at clicked coordinates without changing zoom
        onMapClick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)))
      }
    },
  })

  useEffect(() => {
    if (!flyTarget) return
    const targetZoom = flyTarget.zoom ?? STREET_LEVEL_ZOOM
    let verifyTimer: ReturnType<typeof setTimeout> | null = null

    try {
      map.stop()
      map.setView([flyTarget.lat, flyTarget.lng], targetZoom, {
        animate: true,
        duration: 0.45,
      })

      // Ensure zoom and center are locked to the selected location even if a layout shift occurred
      verifyTimer = setTimeout(() => {
        try {
          const currentCenter = map.getCenter()
          const currentZoom = map.getZoom()
          const distDiff =
            Math.abs(currentCenter.lat - flyTarget.lat) + Math.abs(currentCenter.lng - flyTarget.lng)
          if (currentZoom !== targetZoom || distDiff > 0.0005) {
            map.setView([flyTarget.lat, flyTarget.lng], targetZoom, { animate: false })
          }
        } catch {
          // ignore
        }
      }, 500)
    } catch {
      // ignore
    }

    return () => {
      if (verifyTimer) clearTimeout(verifyTimer)
    }
  }, [map, flyTarget])

  return null
}

/**
 * Overlay toolbar inside the map providing:
 * 1. + Zoom In
 * 2. − Zoom Out
 * 3. My Location
 */
export function MapOverlayToolbar({
  onMyLocation,
  onLocationStatus,
  fallbackLat,
  fallbackLng,
  isLocatingExternal,
}: {
  onMyLocation?: () => void
  onLocationStatus?: (status: { type: 'info' | 'success' | 'warning'; text: string }) => void
  fallbackLat?: number | null
  fallbackLng?: number | null
  isLocatingExternal?: boolean
}) {
  const map = useMap()
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [locatingInternal, setLocatingInternal] = useState(false)

  const locating = Boolean(isLocatingExternal || locatingInternal)

  useEffect(() => {
    if (toolbarRef.current) {
      L.DomEvent.disableClickPropagation(toolbarRef.current)
      L.DomEvent.disableScrollPropagation(toolbarRef.current)
    }
  }, [])

  const stopProp = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const handleZoomIn = (e: React.MouseEvent) => {
    stopProp(e)
    map.setZoom(Math.min(map.getMaxZoom(), map.getZoom() + 1))
  }

  const handleZoomOut = (e: React.MouseEvent) => {
    stopProp(e)
    map.setZoom(Math.max(map.getMinZoom(), map.getZoom() - 1))
  }

  const handleMyLocation = (e: React.MouseEvent) => {
    stopProp(e)

    if (onMyLocation) {
      onMyLocation()
      return
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      onLocationStatus?.({
        type: 'warning',
        text: 'Browser geolocation requires a secure HTTPS or localhost connection. Please place the pin on the map manually.',
      })
      return
    }

    if (!navigator.geolocation) {
      onLocationStatus?.({
        type: 'warning',
        text: 'Geolocation API is not supported by this browser. Drag or click the map to select a location.',
      })
      if (fallbackLat !== undefined && fallbackLat !== null && fallbackLng !== undefined && fallbackLng !== null) {
        map.setView([fallbackLat, fallbackLng], 15, { animate: true })
      }
      return
    }

    setLocatingInternal(true)
    onLocationStatus?.({
      type: 'info',
      text: 'Requesting your current GPS location…',
    })

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingInternal(false)
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        map.setView([lat, lng], STREET_LEVEL_ZOOM, { animate: true })
        onLocationStatus?.({
          type: 'success',
          text: `Centered on your current GPS location (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
        })
      },
      (err) => {
        setLocatingInternal(false)
        const reason =
          err.code === 1
            ? `Location permission was denied (${err.message || 'access blocked'}). Allow location access in your browser settings or place the pin manually.`
            : err.code === 2
            ? `Current GPS position is unavailable (${err.message || 'no fix'}). Please click the map or search an address.`
            : err.code === 3
            ? 'Timed out while acquiring GPS signal. Please try again or select the location on the map.'
            : `Could not retrieve GPS location (${err.message || 'unknown error'}).`
        onLocationStatus?.({
          type: 'warning',
          text: reason,
        })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  return (
    <div
      ref={toolbarRef}
      className="absolute top-3 right-3 z-[400] flex flex-col items-end gap-1.5 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col bg-[#1C3038]/95 border border-[#2A444E] rounded-lg overflow-hidden shadow-lg">
        <button
          type="button"
          onClick={handleZoomIn}
          title="+ Zoom In"
          aria-label="Zoom In"
          className="w-8 h-8 flex items-center justify-center text-[#F4F7F7] hover:bg-[#367F77] transition-colors border-b border-[#2A444E]"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="− Zoom Out"
          aria-label="Zoom Out"
          className="w-8 h-8 flex items-center justify-center text-[#F4F7F7] hover:bg-[#367F77] transition-colors"
        >
          <Minus size={15} />
        </button>
      </div>

      <button
        type="button"
        onClick={handleMyLocation}
        disabled={locating}
        title="Use My Current Location"
        aria-label="Use My Current Location"
        className="px-2.5 py-1.5 rounded-lg bg-[#1C3038]/95 hover:bg-[#367F77] border border-[#2A444E] text-[#F4F7F7] text-[11px] font-semibold flex items-center gap-1.5 shadow-lg transition-colors disabled:opacity-60"
      >
        <Navigation size={13} className={`text-[#91C8BD] ${locating ? 'animate-spin' : ''}`} />
        <span>{locating ? 'Locating…' : 'My Location'}</span>
      </button>
    </div>
  )
}

/**
 * Draggable & clickable pin marker for the selected complaint location.
 */
export function SelectedLocationPin({
  latitude,
  longitude,
  onMove,
}: {
  latitude: number
  longitude: number
  onMove?: (lat: number, lng: number) => void
}) {
  return (
    <>
      <CircleMarker
        center={[latitude, longitude]}
        radius={18}
        pathOptions={{
          color: '#367F77',
          fillColor: '#91C8BD',
          fillOpacity: 0.22,
          weight: 1.5,
        }}
      />
      <Marker
        position={[latitude, longitude]}
        icon={selectedPinIcon}
        draggable={Boolean(onMove)}
        eventHandlers={{
          dragend: (e) => {
            if (!onMove) return
            const pos = e.target.getLatLng()
            if (pos) {
              onMove(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)))
            }
          },
        }}
      />
    </>
  )
}

export interface GeocodeResult {
  name: string
  lat: number
  lng: number
}

const FALLBACK_LANDMARKS: GeocodeResult[] = [
  { name: 'Shivajinagar Bus Stand, Pune', lat: 18.5308, lng: 73.8474 },
  { name: 'Swargate Bus Stand, Satara Road, Pune', lat: 18.5018, lng: 73.856 },
  { name: 'Deccan Gymkhana, JM Road, Pune', lat: 18.5265, lng: 73.8602 },
  { name: 'FC Road (Fergusson College Rd), Pune', lat: 18.5223, lng: 73.8415 },
  { name: 'Pune Railway Station, Pune', lat: 18.5289, lng: 73.8744 },
  { name: 'Katraj Chowk, Pune', lat: 18.4762, lng: 73.8441 },
  { name: 'Kothrud Depot, Paud Road, Pune', lat: 18.5074, lng: 73.8077 },
  { name: 'Viman Nagar, Nagar Road, Pune', lat: 18.5642, lng: 73.9145 },
  { name: 'Hadapsar Bus Stand, Pune', lat: 18.501, lng: 73.9168 },
  { name: 'Baner Road, Pune', lat: 18.559, lng: 73.7868 },
]

/**
 * Search box for landmarks, streets, and addresses.
 * Selecting a result or pressing Find/Enter automatically centers and zooms the map to street level.
 */
export function MapSearchBox({
  onSelectLocation,
  placeholder = 'Search landmark, street or address (e.g. Swargate, FC Road, Kothrud)…',
}: {
  onSelectLocation: (result: GeocodeResult) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const runSearch = async (searchText: string, autoSelectFirst = true) => {
    const trimmed = searchText.trim()
    if (!trimmed) {
      setResults(FALLBACK_LANDMARKS.slice(0, 5))
      setIsOpen(true)
      return
    }
    setIsSearching(true)
    try {
      const res = await client.get('/geocode/search', { params: { q: trimmed } })
      const list: GeocodeResult[] = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : []
      const lower = trimmed.toLowerCase()
      const localFiltered = FALLBACK_LANDMARKS.filter((l) =>
        l.name.toLowerCase().includes(lower)
      )
      const finalResults = list.length > 0 ? list : localFiltered

      setResults(finalResults)
      if (autoSelectFirst && finalResults.length > 0) {
        const bestMatch = finalResults[0]
        setQuery(bestMatch.name)
        onSelectLocation(bestMatch)
        setIsOpen(finalResults.length > 1)
      } else {
        setIsOpen(true)
      }
    } catch {
      const lower = trimmed.toLowerCase()
      const filtered = FALLBACK_LANDMARKS.filter((l) =>
        l.name.toLowerCase().includes(lower)
      )
      const finalResults = filtered.length > 0 ? filtered : FALLBACK_LANDMARKS.slice(0, 5)
      setResults(finalResults)
      if (autoSelectFirst && filtered.length > 0) {
        const bestMatch = filtered[0]
        setQuery(bestMatch.name)
        onSelectLocation(bestMatch)
        setIsOpen(filtered.length > 1)
      } else {
        setIsOpen(true)
      }
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AABDC2]"
          />
          <input
            type="text"
            value={query}
            onFocus={() => {
              if (results.length === 0) setResults(FALLBACK_LANDMARKS.slice(0, 5))
              setIsOpen(true)
            }}
            onChange={(e) => {
              setQuery(e.target.value)
              const val = e.target.value.trim().toLowerCase()
              if (!val) {
                setResults(FALLBACK_LANDMARKS.slice(0, 5))
              } else {
                setResults(
                  FALLBACK_LANDMARKS.filter((l) => l.name.toLowerCase().includes(val))
                )
              }
              setIsOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                runSearch(query, true)
              }
            }}
            placeholder={placeholder}
            className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => runSearch(query, true)}
          disabled={isSearching}
          className="px-3.5 py-2 rounded-lg bg-[#233B44] hover:bg-[#367F77] border border-[#2A444E] text-[#F4F7F7] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          <span>Find</span>
        </button>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-[#1C3038] border border-[#367F77] rounded-xl shadow-2xl z-[500] max-h-52 overflow-y-auto divide-y divide-[#2A444E]">
          {results.map((item, idx) => (
            <button
              key={`${item.lat}-${item.lng}-${idx}`}
              type="button"
              onMouseDown={(e) => {
                // Prevent input blur from closing dropdown before selection completes
                e.preventDefault()
              }}
              onClick={() => {
                setQuery(item.name)
                setIsOpen(false)
                onSelectLocation(item)
              }}
              className="w-full px-3.5 py-2.5 text-left hover:bg-[#233B44] flex items-center justify-between gap-2 text-xs transition-colors"
            >
              <span className="flex items-center gap-2 text-[#F4F7F7] font-medium truncate">
                <MapPin size={13} className="text-[#91C8BD] shrink-0" />
                <span className="truncate">{item.name}</span>
              </span>
              <span className="font-mono text-[11px] text-[#91C8BD] shrink-0">
                {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
              </span>
            </button>
          ))}
          <div className="px-3.5 py-1.5 bg-[#101C23] flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[11px] text-[#AABDC2] hover:text-[#F4F7F7]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
