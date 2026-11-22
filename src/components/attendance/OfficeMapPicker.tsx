'use client'

import React, { useEffect, useRef, useState } from 'react'
import { MapPin, Navigation, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OfficeMapPickerProps {
  latitude: number
  longitude: number
  radiusMeters: number
  onChange: (coords: { lat: number; lng: number; radiusM: number }) => void
}

export function OfficeMapPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
}: OfficeMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null)

  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    // Dynamic import of Leaflet on client side
    let isMounted = true

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return

      const L = await import('leaflet')
      // Inject leaflet CSS if not already present
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      if (!isMounted || !mapContainerRef.current) return

      // Default to EduBridge office if coordinates invalid
      const initialLat = latitude || 25.276987
      const initialLng = longitude || 55.334587

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 16,
        zoomControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // Brand green circle for geofence
      const circle = L.circle([initialLat, initialLng], {
        radius: radiusMeters,
        color: '#00A57E',
        fillColor: '#00A57E',
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map)

      // Custom pulse pin or default marker
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="
          background-color: #00A57E;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 3px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="background-color: #ffffff; width: 6px; height: 6px; border-radius: 50%;"></div>
        </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
        icon: customIcon,
      }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        circle.setLatLng(pos)
        onChange({
          lat: parseFloat(pos.lat.toFixed(7)),
          lng: parseFloat(pos.lng.toFixed(7)),
          radiusM: radiusMeters,
        })
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        circle.setLatLng(e.latlng)
        onChange({
          lat: parseFloat(e.latlng.lat.toFixed(7)),
          lng: parseFloat(e.latlng.lng.toFixed(7)),
          radiusM: radiusMeters,
        })
      })

      mapInstanceRef.current = map
      markerRef.current = marker
      circleRef.current = circle
    }

    initMap()

    return () => {
      isMounted = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync radius changes to Leaflet circle
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusMeters)
    }
  }, [radiusMeters])

  // Sync prop coordinates if changed externally
  useEffect(() => {
    if (markerRef.current && circleRef.current && mapInstanceRef.current) {
      const cur = markerRef.current.getLatLng()
      if (Math.abs(cur.lat - latitude) > 0.00001 || Math.abs(cur.lng - longitude) > 0.00001) {
        markerRef.current.setLatLng([latitude, longitude])
        circleRef.current.setLatLng([latitude, longitude])
        mapInstanceRef.current.panTo([latitude, longitude])
      }
    }
  }, [latitude, longitude])

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }

    setLocating(true)
    setGeoError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const lat = parseFloat(pos.coords.latitude.toFixed(7))
        const lng = parseFloat(pos.coords.longitude.toFixed(7))

        if (markerRef.current && circleRef.current && mapInstanceRef.current) {
          markerRef.current.setLatLng([lat, lng])
          circleRef.current.setLatLng([lat, lng])
          mapInstanceRef.current.setView([lat, lng], 17)
        }

        onChange({
          lat,
          lng,
          radiusM: radiusMeters,
        })
      },
      (err) => {
        setLocating(false)
        setGeoError(`Location failed: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn()
  }

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#00A57E]" />
          Click or drag pin to position office geofence center
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="h-8 text-xs font-medium gap-1.5 text-[#00A57E] hover:text-[#00805F] hover:bg-[#E6F6F2] border-[#00A57E]/30"
        >
          <Navigation className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
          {locating ? 'Acquiring GPS...' : 'Use my current location'}
        </Button>
      </div>

      {geoError && (
        <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
          {geoError}
        </p>
      )}

      <div className="relative w-full h-[320px] rounded-xl overflow-hidden border border-[#E4E7E7] shadow-inner bg-[#F5F6F6]">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Custom Zoom Controls */}
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 shadow-md rounded-lg overflow-hidden border border-[#E4E7E7] bg-white">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 text-gray-700 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="h-px bg-gray-200" />
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 text-gray-700 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Geofence Legend Overlay */}
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-[#E4E7E7] shadow-sm text-xs font-medium text-gray-800 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00A57E]" />
          <span>Radius: {radiusMeters}m geofence</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground font-mono">
        <div>Lat: {latitude.toFixed(6)}</div>
        <div>Lng: {longitude.toFixed(6)}</div>
      </div>
    </div>
  )
}
