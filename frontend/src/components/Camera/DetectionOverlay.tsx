import { useRef, useEffect, useCallback } from 'react'
import type { DetectionResult } from '../../types'
import { categoryEmoji } from '../../utils/categoryHelpers'

const CATEGORY_COLORS: Record<string, string> = {
  pothole: '#f97316',
  garbage: '#ef4444',
  dustbin: '#f59e0b',
  fallen_tree: '#22c55e',
  waterlogging: '#3b82f6',
  streetlight: '#eab308',
  other: '#a855f7',
}

interface DetectionOverlayProps {
  detections: DetectionResult[]
  width: number
  height: number
  isRunning: boolean
}

export default function DetectionOverlay({
  detections,
  width,
  height,
  isRunning,
}: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const scanYRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    // Dark translucent base
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
    ctx.fillRect(0, 0, width, height)

    // Grid overlay
    ctx.strokeStyle = 'rgba(20, 184, 166, 0.08)'
    ctx.lineWidth = 1
    const gridSize = 40
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    if (isRunning) {
      // Scan line
      scanYRef.current = (scanYRef.current + 1.5) % height
      const gradient = ctx.createLinearGradient(0, scanYRef.current - 20, 0, scanYRef.current + 20)
      gradient.addColorStop(0, 'rgba(20, 184, 166, 0)')
      gradient.addColorStop(0.5, 'rgba(20, 184, 166, 0.6)')
      gradient.addColorStop(1, 'rgba(20, 184, 166, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, scanYRef.current - 20, width, 40)

      // Corner brackets
      const bracketSize = 20
      const bracketColor = 'rgba(20, 184, 166, 0.8)'
      ctx.strokeStyle = bracketColor
      ctx.lineWidth = 2
      const corners = [
        [10, 10],
        [width - 10, 10],
        [10, height - 10],
        [width - 10, height - 10],
      ]
      corners.forEach(([cx, cy]) => {
        const dx = cx < width / 2 ? 1 : -1
        const dy = cy < height / 2 ? 1 : -1
        ctx.beginPath()
        ctx.moveTo(cx, cy + dy * bracketSize)
        ctx.lineTo(cx, cy)
        ctx.lineTo(cx + dx * bracketSize, cy)
        ctx.stroke()
      })

      // Detection bounding boxes
      const now = Date.now()
      detections.slice(0, 5).forEach((det, idx) => {
        let bx: number, by: number, bw: number, bh: number
        if (det.bbox && typeof det.bbox === 'object' && !Array.isArray(det.bbox)) {
          // {x1, y1, x2, y2} format from backend
          const bbox = det.bbox as { x1: number; y1: number; x2: number; y2: number }
          // Scale to canvas dimensions (backend coords are in 640x360 space)
          const scaleX = width / 640
          const scaleY = height / 360
          bx = bbox.x1 * scaleX
          by = bbox.y1 * scaleY
          bw = (bbox.x2 - bbox.x1) * scaleX
          bh = (bbox.y2 - bbox.y1) * scaleY
        } else {
          // Generate pseudo-random stable bbox per detection
          const seed = det.confidence * 1000 + idx
          bx = (((seed * 137) % 1000) / 1000) * (width * 0.6)
          by = (((seed * 97) % 1000) / 1000) * (height * 0.5)
          bw = 80 + ((seed * 53) % 80)
          bh = 60 + ((seed * 71) % 60)
        }
        const color = CATEGORY_COLORS[det.category] ?? '#a855f7'
        const alpha = 0.6 + Math.sin(now / 500 + idx) * 0.3

        // Box
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.globalAlpha = alpha
        ctx.strokeRect(bx, by, bw, bh)

        // Fill
        ctx.fillStyle = `${color}22`
        ctx.fillRect(bx, by, bw, bh)
        ctx.globalAlpha = 1

        // Label bg
        const label = `${categoryEmoji(det.category as never)} ${(det.confidence * 100).toFixed(0)}%`
        ctx.font = 'bold 11px Inter, system-ui, sans-serif'
        const labelW = ctx.measureText(label).width + 10
        ctx.fillStyle = color
        ctx.fillRect(bx, by - 18, labelW, 18)

        // Label text
        ctx.fillStyle = '#fff'
        ctx.fillText(label, bx + 5, by - 5)
      })
    } else {
      // Static "STANDBY" overlay
      ctx.fillStyle = 'rgba(20, 184, 166, 0.15)'
      ctx.font = 'bold 14px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('● STANDBY — Press Start Detection', width / 2, height / 2)
      ctx.textAlign = 'left'
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [detections, isRunning, width, height])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}
