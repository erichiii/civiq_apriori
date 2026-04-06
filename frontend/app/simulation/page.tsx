'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { AnimatedBackground } from '@/components/AnimatedBackground'
import { SimulationControls } from '@/components/SimulationControls'

// react-gauge-chart uses D3 and must be client-only (no SSR)
const GaugeComponent = dynamic(() => import('react-gauge-chart'), { ssr: false })

// ─── Status Bar ───────────────────────────────────────────────────────────────

const StatusBar = () => {
  const router = useRouter()
  const NAV_LINKS = [
    { label: 'About',        href: '/#about' },
    { label: 'The Research', href: '/research' },
    { label: 'Contact Us',   href: '/#contact' },
  ]
  return (
    <div className="flex items-center justify-between px-7 py-2.5 flex-shrink-0"
      style={{ background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Logo — click to go home */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-2.5 transition-opacity duration-150 hover:opacity-80"
      >
        <img src="/icons/civiq-logo.png" alt="Civiq" className="w-5 h-5 object-contain brightness-0 invert opacity-80" />
        <span className="font-bold text-[13px] tracking-widest" style={{ color: 'rgba(255,255,255,0.75)' }}>CIVIQ</span>
        <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ·&nbsp; A Hierarchical Multi-Agent Coordination Framework
        </span>
      </button>
      {/* Nav buttons */}
      <div className="flex items-center gap-1">
        {NAV_LINKS.map(({ label, href }) => (
          <button
            key={label}
            onClick={() => router.push(href)}
            className="px-4 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150"
            style={{ color: 'rgba(255,255,255,0.52)', background: 'transparent' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.52)'
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Data ─────────────────────────────────────────────────────────────────────

type AlgoKey = 'civiq' | 'qmix' | 'selfish'
type Page = 'summary' | AlgoKey

// Sparkline series type — swap in real API data once backend is connected
export interface KpiSeries {
  travelTime: number[]
  waitTime: number[]
  throughput: number[]
  speed: number[]
}
export interface KpiChanges {
  travelTime: number
  waitTime: number
  throughput: number
  speed: number
}

// Per-episode data for detail chart — replace with real API data when backend is ready
// Each entry: { episode, value, lo, hi } where lo/hi are confidence band bounds across seeds
export interface EpisodePoint {
  episode: number
  value: number
  lo: number    // lower confidence bound
  hi: number    // upper confidence bound
  ma: number    // 10-episode moving average
}
export interface EpisodeSeries {
  travelTime: EpisodePoint[]
  waitTime:   EpisodePoint[]
  throughput: EpisodePoint[]
  speed:      EpisodePoint[]
}

// Training curve: cumulative reward per episode across seeds
export interface TrainingPoint {
  episode: number
  reward: number
  lo: number   // lower CI across seeds
  hi: number   // upper CI across seeds
  ma: number   // moving average
}

// Decision latency per inference step (ms) — plug in profiler output
export interface LatencyPoint {
  step: number
  latency: number
  ma: number
}

// CPU utilisation per time step (%) — plug in system monitor output
export interface CpuPoint {
  step: number
  cpu: number
  ma: number
}

export interface SystemSeries {
  training: TrainingPoint[]   // empty for selfish (no training)
  latency:  LatencyPoint[]
  cpu:      CpuPoint[]
}

interface AlgoData {
  id: AlgoKey
  label: string
  sublabel: string
  rank: number
  color: string
  colorDim: string
  border: string
  travelTime: number
  waitTime: number
  throughput: number
  speed: number
  co2: number
  fuel: number
  computeTime: number
  convergence: number | null
  reward: number | null
  efficiency: number
  description: string
  strengths: string[]
  scores: number[]
  // Pluggable time-series — replace with real API data when backend is ready
  sparklines: KpiSeries
  changes: KpiChanges
  episodes: EpisodeSeries
  system: SystemSeries
}

// Generate dummy episode series with noise, trend, and confidence band
// Replace calls to this with real API data when backend is ready
function makeSeries(
  start: number, end: number, noiseAmp: number,
  band: number, episodes = 200, seed = 1
): EpisodePoint[] {
  const pts: EpisodePoint[] = []
  let r = seed
  const rand = () => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff - 0.5 }
  const raw: number[] = []
  for (let i = 0; i < episodes; i++) {
    const t = i / (episodes - 1)
    raw.push(start + (end - start) * t + rand() * noiseAmp)
  }
  const W = 10
  for (let i = 0; i < episodes; i++) {
    const slice = raw.slice(Math.max(0, i - W + 1), i + 1)
    const ma = slice.reduce((a, b) => a + b, 0) / slice.length
    const noise = rand() * noiseAmp * 0.4
    pts.push({ episode: i + 1, value: +raw[i].toFixed(2), lo: +(raw[i] - band + noise).toFixed(2), hi: +(raw[i] + band + noise).toFixed(2), ma: +ma.toFixed(2) })
  }
  return pts
}

// Training curve: reward from ~start → end, with logistic ease-in (slow start, fast rise, plateau)
function makeTraining(startR: number, endR: number, band: number, episodes = 200, seed = 1): TrainingPoint[] {
  let r = seed
  const rand = () => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff - 0.5 }
  const W = 10
  const raw: number[] = []
  for (let i = 0; i < episodes; i++) {
    // logistic curve: slow at first, rapid middle, plateau near end
    const t = i / (episodes - 1)
    const logistic = 1 / (1 + Math.exp(-10 * (t - 0.35)))
    raw.push(startR + (endR - startR) * logistic + rand() * (band * 1.4))
  }
  const pts: TrainingPoint[] = []
  for (let i = 0; i < episodes; i++) {
    const slice = raw.slice(Math.max(0, i - W + 1), i + 1)
    const ma = slice.reduce((a, b) => a + b, 0) / slice.length
    const bNoise = rand() * band * 0.3
    pts.push({ episode: i + 1, reward: +raw[i].toFixed(1), lo: +(raw[i] - band + bNoise).toFixed(1), hi: +(raw[i] + band + bNoise).toFixed(1), ma: +ma.toFixed(1) })
  }
  return pts
}

// Decision latency: starts high (cold), drops and stabilises
function makeLatency(baseMs: number, peakMs: number, noiseAmp: number, steps = 120, seed = 1): LatencyPoint[] {
  let r = seed
  const rand = () => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff - 0.5 }
  const W = 8
  const raw: number[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    // exponential decay from peak → base
    const decay = baseMs + (peakMs - baseMs) * Math.exp(-5 * t)
    raw.push(decay + rand() * noiseAmp)
  }
  const pts: LatencyPoint[] = []
  for (let i = 0; i < steps; i++) {
    const slice = raw.slice(Math.max(0, i - W + 1), i + 1)
    const ma = slice.reduce((a, b) => a + b, 0) / slice.length
    pts.push({ step: i + 1, latency: +raw[i].toFixed(2), ma: +ma.toFixed(2) })
  }
  return pts
}

// CPU utilization: rises at start, peaks, then stabilises
function makeCpu(basePercent: number, peakPercent: number, noiseAmp: number, steps = 120, seed = 1): CpuPoint[] {
  let r = seed
  const rand = () => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff - 0.5 }
  const W = 8
  const raw: number[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    // bell-ish: rises quickly to peak then settles at base
    const shaped = basePercent + (peakPercent - basePercent) * Math.exp(-4 * Math.pow(t - 0.15, 2)) * (1 - t * 0.4)
    raw.push(Math.min(100, Math.max(0, shaped + rand() * noiseAmp)))
  }
  const pts: CpuPoint[] = []
  for (let i = 0; i < steps; i++) {
    const slice = raw.slice(Math.max(0, i - W + 1), i + 1)
    const ma = slice.reduce((a, b) => a + b, 0) / slice.length
    pts.push({ step: i + 1, cpu: +raw[i].toFixed(1), ma: +ma.toFixed(1) })
  }
  return pts
}

const ALGO: Record<AlgoKey, AlgoData> = {
  civiq: {
    id: 'civiq', label: 'Hierarchical QMIX', sublabel: 'Civiq', rank: 1,
    color: '#38BDF8', colorDim: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)',
    travelTime: 4.2, waitTime: 18.5, throughput: 1875, speed: 1.24,
    co2: 142, fuel: 23, computeTime: 22.35, convergence: 150, reward: 1250, efficiency: 88,
    description: 'Civiq employs a hierarchical two-tier coordination mechanism where a global orchestrator assigns zone-level routing goals, while local agents optimize intersection-level decisions using QMIX. This architecture enables scalable, cooperative traffic management that generalizes across varying network topologies and traffic densities.',
    strengths: ['Lowest travel time across all scenarios', 'Best emission reduction (37% vs baseline)', 'Superior network throughput coordination', 'Scalable to larger road networks'],
    scores: [0.90, 0.90, 0.88, 0.70, 0.88, 0.88, 0.82],
    sparklines: {
      travelTime:  [8.5, 7.8, 7.1, 6.4, 5.9, 5.3, 4.9, 4.6, 4.4, 4.2],
      waitTime:    [36, 32, 29, 26, 24, 22, 21, 20, 19, 18.5],
      throughput:  [1380, 1480, 1570, 1650, 1710, 1760, 1810, 1840, 1862, 1875],
      speed:       [0.86, 0.92, 0.97, 1.02, 1.08, 1.12, 1.16, 1.19, 1.22, 1.24],
    },
    changes: { travelTime: -50.6, waitTime: -48.6, throughput: 35.9, speed: 44.2 },
    episodes: {
      travelTime:  makeSeries(8.5, 4.2,   0.5, 0.35, 200, 1),
      waitTime:    makeSeries(36,  18.5,  1.8, 1.2,  200, 2),
      throughput:  makeSeries(1380,1875,  38,  28,   200, 3),
      speed:       makeSeries(0.86, 1.24,  0.06, 0.04, 200, 4),
    },
    system: {
      training: makeTraining(-200, 1250, 120, 200, 13),
      latency:  makeLatency(22, 68, 4.5, 120, 14),
      cpu:      makeCpu(28, 72, 6, 120, 15),
    },
  },
  qmix: {
    id: 'qmix', label: 'Monolithic QMIX', sublabel: 'Baseline RL', rank: 2,
    color: '#A78BFA', colorDim: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)',
    travelTime: 5.8, waitTime: 26.3, throughput: 1720, speed: 1.11,
    co2: 178, fuel: 31, computeTime: 18.20, convergence: 200, reward: 980, efficiency: 71,
    description: 'Monolithic QMIX applies centralized multi-agent reinforcement learning where all agents share a joint action-value function. While effective at coordination, the monolithic architecture faces scalability limitations as network size grows, requiring more training episodes and compute to converge on larger topologies.',
    strengths: ['Fastest compute time per decision step', 'Good coordination at small scale', 'Solid baseline RL performance', 'Well-established QMIX framework'],
    scores: [0.80, 0.70, 0.70, 0.90, 0.72, 0.72, 0.75],
    sparklines: {
      travelTime:  [10.2, 9.5, 8.9, 8.3, 7.8, 7.3, 6.9, 6.5, 6.1, 5.8],
      waitTime:    [42, 39, 36, 34, 32, 30, 29, 28, 27, 26.3],
      throughput:  [1280, 1360, 1430, 1500, 1560, 1610, 1650, 1685, 1705, 1720],
      speed:       [0.74, 0.80, 0.85, 0.89, 0.94, 0.98, 1.01, 1.05, 1.09, 1.11],
    },
    changes: { travelTime: -43.1, waitTime: -37.4, throughput: 34.4, speed: 33.7 },
    episodes: {
      travelTime:  makeSeries(10.2, 5.8,  0.7, 0.5,  200, 5),
      waitTime:    makeSeries(42,   26.3, 2.2, 1.7,  200, 6),
      throughput:  makeSeries(1280, 1720, 45,  35,   200, 7),
      speed:       makeSeries(0.74, 1.11,  0.07, 0.05, 200, 8),
    },
    system: {
      training: makeTraining(-180, 980, 140, 200, 16),
      latency:  makeLatency(18, 52, 3.8, 120, 17),
      cpu:      makeCpu(22, 58, 5, 120, 18),
    },
  },
  selfish: {
    id: 'selfish', label: 'Selfish Routing', sublabel: 'Nash Equilibrium', rank: 3,
    color: '#F87171', colorDim: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)',
    travelTime: 8.1, waitTime: 35.0, throughput: 1428, speed: 0.93,
    co2: 235, fuel: 42, computeTime: 20.45, convergence: null, reward: null, efficiency: 48,
    description: 'Selfish Routing models each vehicle independently optimizing its own route via shortest-path algorithms, representing the Nash Equilibrium state of the network. Without coordination, vehicles converge on popular routes causing Braess\'s Paradox — where adding road capacity can paradoxically worsen network-wide performance.',
    strengths: ['No training or setup required', 'Simple and fully interpretable', 'Establishes the Price of Anarchy baseline', 'Handles novel edge cases naturally'],
    scores: [0.58, 0.42, 0.40, 0.80, 0.42, 0.52, 0.70],
    sparklines: {
      travelTime:  [7.9, 8.4, 7.7, 8.5, 8.0, 8.6, 7.8, 8.3, 8.0, 8.1],
      waitTime:    [34, 37, 33, 38, 35, 37, 34, 36, 35, 35],
      throughput:  [1460, 1435, 1455, 1420, 1445, 1415, 1440, 1425, 1432, 1428],
      speed:       [0.95, 0.91, 0.97, 0.92, 0.94, 0.90, 0.95, 0.92, 0.94, 0.93],
    },
    changes: { travelTime: 2.5, waitTime: 2.9, throughput: -2.2, speed: -2.1 },
    episodes: {
      travelTime:  makeSeries(8.1,  8.1,  0.9, 0.6,  200, 9),
      waitTime:    makeSeries(35,   35,   3.0, 2.2,  200, 10),
      throughput:  makeSeries(1428, 1428, 55,  42,   200, 11),
      speed:       makeSeries(0.93, 0.93, 0.05, 0.04, 200, 12),
    },
    system: {
      training: [],  // Selfish Routing has no training phase
      latency:  makeLatency(20, 24, 2.5, 120, 19),
      cpu:      makeCpu(18, 35, 4, 120, 20),
    },
  },
}

const ALGO_LIST = [ALGO.civiq, ALGO.qmix, ALGO.selfish]

// ─── Reusable UI primitives ────────────────────────────────────────────────────

const GlassCard = ({
  children, className = '', style = {}, onClick,
}: { children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) => (
  <div className={className} onClick={onClick} style={{
    background: 'linear-gradient(155deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '16px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.32)',
    ...style,
  }}>{children}</div>
)

// ─── Sparkline ────────────────────────────────────────────────────────────────

const SparkLine = ({ data, color }: { data: number[]; color: string }) => {
  if (!data || data.length < 2) return null
  const W = 96, H = 44, PAD = 2
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: PAD + (H - PAD * 2) - ((v - min) / range) * (H - PAD * 2),
  }))
  const linePts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPts = [
    `${pts[0].x.toFixed(1)},${H}`,
    ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `${pts[pts.length - 1].x.toFixed(1)},${H}`,
  ].join(' ')
  const gid = `sp-${color.replace('#', '')}`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* last-point dot */}
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5"
        fill={color} />
    </svg>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard = ({ label, abbr, value, unit, color, colorDim, borderColor, change, lowerBetter, sparkData, onClick, description, descriptionSide = 'right' }: {
  label: string; abbr?: string; value: string | number; unit: string
  color: string; colorDim?: string; borderColor?: string
  change?: number; lowerBetter?: boolean; sparkData?: number[]; onClick?: () => void; description?: string; descriptionSide?: 'left' | 'right'
}) => {
  // Green = good outcome, regardless of direction
  const isGood = change === undefined ? true : lowerBetter ? change <= 0 : change >= 0
  const changeColor = isGood ? '#4ADE80' : '#F87171'
  const changeArrow = (change ?? 0) >= 0 ? '▲' : '▼'
  return (
    <GlassCard className="group relative z-0 hover:z-30 p-4 flex flex-col gap-2 transition-all duration-200"
      onClick={onClick}
      style={{
        background: colorDim
          ? `linear-gradient(145deg, ${colorDim.replace('0.12', '0.10')} 0%, rgba(255,255,255,0.03) 100%)`
          : undefined,
        border: borderColor ? `1px solid ${borderColor.replace('0.3', '0.25')}` : undefined,
        cursor: onClick ? 'pointer' : 'default',
      }}>
      {/* Title */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider leading-none"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            {label}{abbr ? ` (${abbr})` : ''}
          </span>
          {description && (
            <div
              className="group/info relative z-20"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(6,182,212,0.2)',
                  border: '1px solid rgba(6,182,212,0.65)',
                  color: 'rgba(217,249,255,0.95)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.2) inset',
                }}
              >
                <span className="text-[10px] font-bold leading-none">!</span>
              </div>
              <div
                className="pointer-events-none absolute top-[calc(100%+8px)] w-[280px] rounded-lg px-3 py-2 text-[10px] leading-relaxed opacity-0 translate-y-1 transition-all duration-150 group-hover/info:opacity-100 group-hover/info:translate-y-0"
                style={
                  descriptionSide === 'left'
                    ? {
                        right: 0,
                        background: 'rgba(4,9,22,0.97)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.88)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.45)',
                        zIndex: 90,
                      }
                    : {
                      left: 0,
                        background: 'rgba(4,9,22,0.97)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.88)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.45)',
                        zIndex: 90,
                      }
                }
              >
                {description}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onClick && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors duration-150"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.28)', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.18)'
                ;(e.currentTarget as HTMLElement).style.color = 'rgba(186,230,253,0.95)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.55)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
                ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.28)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'
              }}>
              View detail
            </span>
          )}
        </div>
      </div>

      {/* Value + sparkline row */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          {/* Value + unit */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold tabular-nums leading-none" style={{ color }}>{value}</span>
            <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.38)' }}>{unit}</span>
          </div>
          {/* Change badge below value */}
          {change !== undefined && (
            <span className="text-[11px] font-bold tabular-nums"
              style={{ color: changeColor }}>
              {changeArrow} {Math.abs(change).toFixed(1)}%
            </span>
          )}
        </div>
        {sparkData && <SparkLine data={sparkData} color={color} />}
      </div>

    </GlassCard>
  )
}

const HBar = ({ value, max, color, dim = false }: { value: number; max: number; color: string; dim?: boolean }) => (
  <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)' }}>
    <div className="h-full rounded-full transition-all duration-700"
      style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, opacity: dim ? 0.45 : 1 }} />
  </div>
)

const RingChart = ({ value, max = 100, color, size = 88 }: {
  value: number; max?: number; color: string; size?: number
}) => {
  const r = (size - 14) / 2
  const circ = 2 * Math.PI * r
  const dash = (value / max) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    </svg>
  )
}

// ─── Radar Chart ───────────────────────────────────────────────────────────────

const RADAR_AXES = ['Throughput', 'Wait Time', 'Travel Time', 'Compute', 'CO₂', 'Fuel', 'RTF']
const RC = { x: 175, y: 175 }
const RR = 125

function rPt(axisIdx: number, score: number): string {
  const a = -Math.PI / 2 + (2 * Math.PI * axisIdx) / RADAR_AXES.length
  return `${(RC.x + score * RR * Math.cos(a)).toFixed(1)},${(RC.y + score * RR * Math.sin(a)).toFixed(1)}`
}
function rPts(scores: number[]) { return scores.map((s, i) => rPt(i, s)).join(' ') }
function rLabel(i: number) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / RADAR_AXES.length
  return { x: RC.x + (RR + 22) * Math.cos(a), y: RC.y + (RR + 22) * Math.sin(a) }
}

const RadarChart = () => (
  <svg viewBox="0 0 350 350" className="w-full max-w-[320px] mx-auto">
    {[0.25, 0.5, 0.75, 1].map((r) => (
      <polygon key={r} points={rPts(Array(7).fill(r))}
        fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="1" />
    ))}
    {RADAR_AXES.map((_, i) => {
      const pt = { x: RC.x + RR * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / RADAR_AXES.length), y: RC.y + RR * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / RADAR_AXES.length) }
      return <line key={i} x1={RC.x} y1={RC.y} x2={pt.x} y2={pt.y} stroke="rgba(255,255,255,0.11)" strokeWidth="1" />
    })}
    <polygon points={rPts(ALGO.selfish.scores)} fill="rgba(248,113,113,0.12)" stroke="#F87171" strokeWidth="1.5" strokeLinejoin="round" />
    <polygon points={rPts(ALGO.qmix.scores)} fill="rgba(167,139,250,0.12)" stroke="#A78BFA" strokeWidth="1.5" strokeLinejoin="round" />
    <polygon points={rPts(ALGO.civiq.scores)} fill="rgba(56,189,248,0.18)" stroke="#38BDF8" strokeWidth="2" strokeLinejoin="round" />
    {RADAR_AXES.map((label, i) => {
      const { x, y } = rLabel(i)
      return (
        <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fill="rgba(255,255,255,0.45)" fontWeight="500">{label}</text>
      )
    })}
  </svg>
)

// ─── Summary Page ──────────────────────────────────────────────────────────────

const rankMeta = [
  { label: '1st Place', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  { label: '2nd Place', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  { label: '3rd Place', color: '#B45309', bg: 'rgba(180,83,9,0.12)' },
]

const COMPARE_METRICS = [
  { label: 'Avg. Travel Time', unit: 'min', key: 'travelTime' as const, max: 10, lowerBetter: true },
  { label: 'Avg. Wait Time', unit: 'sec', key: 'waitTime' as const, max: 40, lowerBetter: true },
  { label: 'Throughput', unit: 'veh/hr', key: 'throughput' as const, max: 2000, lowerBetter: false },
  { label: 'Real-time Factor', unit: 'x', key: 'speed' as const, max: 2, lowerBetter: false },
  { label: 'CO₂ Emissions', unit: 'g/km', key: 'co2' as const, max: 280, lowerBetter: true },
  { label: 'Compute Time', unit: 'ms', key: 'computeTime' as const, max: 30, lowerBetter: true },
]

const SummaryPage = () => (
  <div className="p-6 space-y-5 overflow-y-auto" style={{ height: '100%' }}>
    {/* Header */}
    <div className="flex items-baseline justify-between">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Algorithm Comparison</h2>
        <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
          Aggregate performance across Civiq, Monolithic QMIX, and Selfish Routing
        </p>
      </div>
      <div className="flex items-center gap-4">
        {ALGO_LIST.map((a) => (
          <div key={a.id} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{a.sublabel}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Rank cards */}
    <div className="grid grid-cols-3 gap-4">
      {ALGO_LIST.map((a, i) => (
        <GlassCard key={a.id} className="p-5 relative overflow-hidden" style={{ border: `1px solid ${a.border}` }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 80% 0%, ${a.colorDim}, transparent 65%)` }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: rankMeta[i].bg, color: rankMeta[i].color }}>
                {rankMeta[i].label}
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                <span className="text-[11px] font-medium" style={{ color: a.color }}>{a.sublabel}</span>
              </div>
            </div>
            <h3 className="text-[15px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.9)' }}>{a.label}</h3>
            <div className="space-y-2 text-[12px]">
              {[
                { k: 'Travel Time', v: `${a.travelTime} min` },
                { k: 'Throughput', v: `${a.throughput.toLocaleString()} veh/hr` },
                { k: 'CO₂ Emissions', v: `${a.co2} g/km` },
              ].map(({ k, v }) => (
                <div key={k} className="flex justify-between">
                  <span style={{ color: 'rgba(255,255,255,0.42)' }}>{k}</span>
                  <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.82)' }}>{v}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span style={{ color: 'rgba(255,255,255,0.42)' }}>Efficiency</span>
                <span className="font-bold" style={{ color: a.color }}>{a.efficiency}%</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <HBar value={a.efficiency} max={100} color={a.color} />
              <span className="text-[11px] font-bold w-8 text-right tabular-nums" style={{ color: a.color }}>{a.efficiency}%</span>
            </div>
          </div>
        </GlassCard>
      ))}
    </div>

    {/* Radar + Breakdown */}
    <div className="grid grid-cols-5 gap-4">
      <GlassCard className="col-span-2 p-5">
        <h3 className="text-[13px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.78)' }}>Performance Radar</h3>
        <RadarChart />
        <div className="flex justify-center gap-5 mt-2">
          {ALGO_LIST.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{a.sublabel}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="col-span-3 p-5">
        <h3 className="text-[13px] font-bold mb-4" style={{ color: 'rgba(255,255,255,0.78)' }}>Metrics Breakdown</h3>
        <div className="space-y-4">
          {COMPARE_METRICS.map((m) => {
            const vals = ALGO_LIST.map((a) => a[m.key] as number)
            const best = m.lowerBetter ? Math.min(...vals) : Math.max(...vals)
            return (
              <div key={m.key}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.48)' }}>{m.label}</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{m.unit}</span>
                </div>
                <div className="space-y-1.5">
                  {ALGO_LIST.map((a) => {
                    const val = a[m.key] as number
                    const isBest = val === best
                    const barW = m.lowerBetter
                      ? ((m.max - val) / m.max) * 100
                      : (val / m.max) * 100
                    return (
                      <div key={a.id} className="flex items-center gap-2.5">
                        <span className="text-[10px] w-10 text-right tabular-nums" style={{ color: 'rgba(255,255,255,0.4)' }}>{val}</span>
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)' }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${barW}%`, background: a.color, opacity: isBest ? 1 : 0.42 }} />
                        </div>
                        <div className="w-3.5 flex items-center justify-center">
                          {isBest && <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#22C55E" /></svg>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </GlassCard>
    </div>

    {/* Key Findings */}
    <GlassCard className="p-5">
      <h3 className="text-[13px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.78)' }}>Key Findings</h3>
      <div className="grid grid-cols-3 gap-5 text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {ALGO_LIST.map((a) => (
          <div key={a.id}>
            <p className="font-semibold mb-1.5" style={{ color: a.color }}>{a.label}</p>
            <p className="leading-relaxed">{a.description}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  </div>
)

// ─── Gauge Chart ──────────────────────────────────────────────────────────────
// Wraps react-gauge-chart. To plug in real data, pass the live `value` and
// `max` from your API response — the `percent` is computed here automatically.

const GaugeChart = ({ value, max, label, unit, accentColor, description }: {
  value: number   // current reading (e.g. 142 g/km) — replace with API value
  max: number     // scale ceiling (e.g. 300) — adjust to match data range
  label: string
  unit: string
  accentColor: string
  description?: string
}) => {
  const percent = Math.min(1, Math.max(0, value / max))

  return (
    <GlassCard className="group relative z-0 hover:z-20 flex-1 flex flex-col items-center justify-center py-2 px-2 gap-1"
      style={{ background: 'rgba(255,255,255,0.045)', minWidth: 0 }}>
      {description && (
        <div className="group/info absolute top-2 right-2 z-20">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(6,182,212,0.2)',
              border: '1px solid rgba(6,182,212,0.65)',
              color: 'rgba(217,249,255,0.95)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2) inset',
            }}
          >
            <span className="text-[11px] font-bold leading-none">!</span>
          </div>
          <div className="pointer-events-none absolute right-0 top-[calc(100%+8px)] w-[280px] rounded-lg px-3 py-2 text-[10px] leading-relaxed opacity-0 translate-y-1 transition-all duration-150 group-hover/info:opacity-100 group-hover/info:translate-y-0"
            style={{
              background: 'rgba(4,9,22,0.97)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.88)',
              boxShadow: '0 12px 24px rgba(0,0,0,0.45)',
              zIndex: 85,
            }}>
            {description}
          </div>
        </div>
      )}

      <GaugeComponent
        id={`gauge-${label.replace(/\W/g, '')}`}
        percent={percent}
        nrOfLevels={20}
        colors={['#16A34A', '#65A30D', '#CA8A04', '#DC2626']}
        arcWidth={0.3}
        arcPadding={0.02}
        needleColor={accentColor}
        needleBaseColor={accentColor}
        animate={false}
        hideText
        style={{ width: '100%', maxWidth: '140px' }}
      />
      {/* Value + unit centred below arc */}
      <div className="flex flex-col items-center mt-0.5">
        <span className="text-[20px] font-extrabold tabular-nums leading-none" style={{ color: '#ffffff' }}>
          {value}
        </span>
        <span className="text-[10px] font-semibold mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>{unit}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider mt-1.5 text-center"
          style={{ color: 'rgba(255,255,255,0.65)' }}>{label}</span>
      </div>
    </GlassCard>
  )
}

// ─── Map Player ───────────────────────────────────────────────────────────────

const MapPlayer = ({ algo, mapSize }: { algo: AlgoData; mapSize: string }) => {
  // Playback
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

  // Pan / zoom — start zoomed in so the video fills and users can explore
  const INITIAL_ZOOM = 2.5
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const zoomRef = useRef(INITIAL_ZOOM)
  const panRef = useRef({ x: 0, y: 0 })
  zoomRef.current = zoom
  panRef.current = pan
  const dragging = useRef(false)
  const dragOrigin = useRef({ x: 0, y: 0 })
  const panOrigin = useRef({ x: 0, y: 0 })

  // Wire playback rate to video
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  // Center the view on mount so the zoomed-in video is centered
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPan({
      x: -(width * (INITIAL_ZOOM - 1)) / 2,
      y: -(height * (INITIAL_ZOOM - 1)) / 2,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wheel → zoom toward cursor (passive: false so we can preventDefault)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 0.87
      const newZoom = Math.min(8, Math.max(1, zoomRef.current * factor))
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // Keep the point under the cursor fixed
      const rawX = mx - (mx - panRef.current.x) * (newZoom / zoomRef.current)
      const rawY = my - (my - panRef.current.y) * (newZoom / zoomRef.current)
      const { width, height } = rect
      setZoom(newZoom)
      setPan({
        x: Math.min(0, Math.max(rawX, width  * (1 - newZoom))),
        y: Math.min(0, Math.max(rawY, height * (1 - newZoom))),
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    dragOrigin.current = { x: e.clientX, y: e.clientY }
    panOrigin.current = { ...panRef.current }
    e.preventDefault()
  }
  const clampPan = (x: number, y: number, z: number) => {
    const el = containerRef.current
    if (!el) return { x, y }
    const { width, height } = el.getBoundingClientRect()
    return {
      x: Math.min(0, Math.max(x, width  * (1 - z))),
      y: Math.min(0, Math.max(y, height * (1 - z))),
    }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const raw = {
      x: panOrigin.current.x + (e.clientX - dragOrigin.current.x),
      y: panOrigin.current.y + (e.clientY - dragOrigin.current.y),
    }
    setPan(clampPan(raw.x, raw.y, zoomRef.current))
  }
  const stopDrag = () => { dragging.current = false }

  // Playback helpers
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }
  const seek = (pct: number) => {
    const v = videoRef.current
    if (!v || !duration) return
    v.currentTime = Math.max(0, Math.min(duration, pct * duration))
  }
  const reset = () => {
    const v = videoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
    setPlaying(false)
    setCurrentTime(0)
    // Return to initial centered zoom
    const el = containerRef.current
    const { width, height } = el?.getBoundingClientRect() ?? { width: 0, height: 0 }
    setZoom(INITIAL_ZOOM)
    setPan({
      x: -(width * (INITIAL_ZOOM - 1)) / 2,
      y: -(height * (INITIAL_ZOOM - 1)) / 2,
    })
  }

  const pct = duration > 0 ? currentTime / duration : 0
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <GlassCard className="p-4 flex flex-col gap-3 col-span-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)' }}>Map Player</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded tabular-nums"
            style={{ background: algo.colorDim, color: algo.color, border: `1px solid ${algo.border}` }}>
            {fmt(currentTime)} / {duration > 0 ? fmt(duration) : '--:--'}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded tabular-nums"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
            {zoom.toFixed(1)}×
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' }}>
            {MAP_LABELS[mapSize] || mapSize || '—'}
          </span>
        </div>
      </div>

      {/* Video viewport — pan/zoom container */}
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden relative w-full select-none"
        style={{
          aspectRatio: '16 / 9',
          background: '#000',
          border: '1px solid rgba(255,255,255,0.07)',
          cursor: zoom > 1 ? 'grab' : 'default',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        {/* Transformed video layer */}
        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          <video
            ref={videoRef}
            src="/simulation.mp4"
            muted
            playsInline
            preload="auto"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
            onEnded={() => setPlaying(false)}
          />
        </div>

        {/* Hint overlay when paused at start */}
        {!playing && currentTime === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>
              Press ▶ to play · scroll to zoom · drag to pan
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2.5">
        {/* Restart */}
        <button onClick={reset}
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
        {/* Play / Pause */}
        <button onClick={togglePlay}
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-colors duration-150"
          style={{ background: algo.colorDim, border: `1px solid ${algo.border}` }}>
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill={algo.color}>
              <rect x="1" y="1" width="3" height="8" rx="0.5"/>
              <rect x="6" y="1" width="3" height="8" rx="0.5"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill={algo.color}>
              <path d="M2 1 L9 5 L2 9 Z"/>
            </svg>
          )}
        </button>
        {/* Seek bar */}
        <div className="flex-1 h-1.5 rounded-full relative cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.1)' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seek((e.clientX - rect.left) / rect.width)
          }}>
          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: algo.color }} />
          <div className="absolute top-1/2 w-3 h-3 rounded-full pointer-events-none"
            style={{
              left: `${pct * 100}%`,
              transform: 'translate(-50%, -50%)',
              background: 'white',
              boxShadow: `0 0 6px ${algo.color}, 0 0 0 2px ${algo.color}`,
            }} />
        </div>
        {/* Speed */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {[0.5, 1, 2, 4].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors duration-150"
              style={{
                background: speed === s ? algo.colorDim : 'transparent',
                color: speed === s ? algo.color : 'rgba(255,255,255,0.28)',
                border: speed === s ? `1px solid ${algo.border}` : '1px solid transparent',
              }}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Emission gauges — flex-1 so they fill remaining height naturally */}
      <div className="flex gap-3 pt-5 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <GaugeChart
          value={algo.co2}
          max={300}
          label="Avg CO₂ Emissions"
          unit="g/km"
          accentColor={algo.color}
          description="The mean carbon dioxide output per vehicle during the simulation, as measured by SUMO's emissions model. Lower values reflect more efficient routing."
        />
        <GaugeChart
          value={algo.fuel}
          max={55}
          label="Avg Fuel Consumption"
          unit="L/100km"
          accentColor={algo.color}
          description="The mean fuel used per vehicle throughout the simulation, as calculated by SUMO. Reflects the environmental cost of routing behavior."
        />
      </div>
    </GlassCard>
  )
}

// ─── Congestion Heatmap ───────────────────────────────────────────────────────
// Maps each algo to its representative heatmap image.
// civiq / qmix (better performing) → heatmap_low  |  selfish → heatmap_high
// Replace src values with real per-run images when backend is connected.
const HEATMAP_IMG: Record<AlgoKey, string> = {
  civiq:   '/heatmap_output/bgc_full_intersection_based/heatmap_low.png',
  qmix:    '/heatmap_output/bgc_full_intersection_based/heatmap_low.png',
  selfish: '/heatmap_output/bgc_full_intersection_based/heatmap_high.png',
}

const CongestionHeatmap = ({ algo }: { algo: AlgoData }) => (
  <GlassCard className="p-4 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <h3 className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)' }}>Congestion Heatmap</h3>
      <div className="flex items-center gap-2">
        <span className="text-[9px] px-2 py-0.5 rounded"
          style={{ background: algo.colorDim, color: algo.color, border: `1px solid ${algo.border}` }}>
          {algo.id === 'selfish' ? 'High Congestion' : 'Low Congestion'}
        </span>
        <span className="text-[9px] italic" style={{ color: 'rgba(255,255,255,0.2)' }}>sample data</span>
      </div>
    </div>

    <div className="rounded-xl overflow-hidden flex-1"
      style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(3,7,18,0.75)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={HEATMAP_IMG[algo.id]}
        alt={`${algo.label} congestion heatmap`}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>

    {/* Legend */}
    <div className="flex items-center gap-2">
      <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Low</span>
      <div className="flex-1 h-1.5 rounded-full" style={{
        background: 'linear-gradient(to right, #22C55E, #EAB308, #EF4444)', opacity: 0.7,
      }} />
      <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>High</span>
    </div>
  </GlassCard>
)

// ─── Episode Detail Modal ─────────────────────────────────────────────────────

type EpisodeMetricKey = keyof EpisodeSeries

const KPI_META: Record<EpisodeMetricKey, { label: string; abbr: string; unit: string }> = {
  travelTime: { label: 'Avg. Travel Time', abbr: 'ATT', unit: 'min' },
  waitTime:   { label: 'Avg. Wait Time',   abbr: 'AWT', unit: 'sec' },
  throughput: { label: 'Throughput',        abbr: 'TPT', unit: 'veh/hr' },
  speed:      { label: 'Real-time Factor',  abbr: 'RTF', unit: 'x' },
}

const EpisodeDetailModal = ({ algo, metricKey, onClose }: {
  algo: AlgoData
  metricKey: EpisodeMetricKey
  onClose: () => void
}) => {
  const meta = KPI_META[metricKey]
  const data = algo.episodes[metricKey]

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const byKey = Object.fromEntries(payload.map((p: any) => [p.dataKey, p.value]))
    return (
      <div style={{ background: 'rgba(4,9,22,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px', fontSize: 11 }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Episode {label}</p>
        {byKey.value  !== undefined && <p style={{ color: algo.color }}>Value: <b>{byKey.value.toFixed(2)}</b> {meta.unit}</p>}
        {byKey.ma     !== undefined && <p style={{ color: 'rgba(255,255,255,0.7)' }}>MA-10: <b>{byKey.ma.toFixed(2)}</b> {meta.unit}</p>}
        {byKey.hi     !== undefined && byKey.lo !== undefined && (
          <p style={{ color: 'rgba(255,255,255,0.35)' }}>Band: {byKey.lo.toFixed(2)} – {byKey.hi.toFixed(2)}</p>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full mx-6 rounded-2xl p-6 flex flex-col gap-4"
        style={{
          maxWidth: '780px',
          background: 'rgba(4,9,22,0.97)',
          border: '1px solid rgba(255,255,255,0.13)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[17px] font-bold leading-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
              {meta.label}{' '}
              <span style={{ color: algo.color }}>({meta.abbr})</span>
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Per-episode trend · {algo.label} · {data.length} episodes
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-6 h-[2px] rounded" style={{ background: algo.color }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>Per-episode value</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-[2px] rounded" style={{ background: 'rgba(255,255,255,0.65)', borderTop: '2px dashed rgba(255,255,255,0.65)' }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>10-ep. moving avg.</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-3.5 rounded-sm" style={{ background: algo.color, opacity: 0.18 }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>Confidence band</span>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 4" />
            <XAxis
              dataKey="episode"
              tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
              tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              label={{ value: 'Episode', position: 'insideBottom', offset: -12, fill: 'rgba(255,255,255,0.28)', fontSize: 11 }}
              interval={Math.floor(data.length / 10)}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
              tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickFormatter={(v) => `${v}`}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Confidence band: hi fills to baseline, lo paints over with bg colour */}
            <Area type="monotone" dataKey="hi" stroke="none"
              fill={algo.color} fillOpacity={0.14} dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
            <Area type="monotone" dataKey="lo" stroke="none"
              fill="#040916" fillOpacity={1} dot={false} activeDot={false} legendType="none" isAnimationActive={false} />

            {/* Raw per-episode line */}
            <Line type="monotone" dataKey="value" stroke={algo.color} strokeWidth={1.5}
              dot={false} activeDot={{ r: 3, fill: algo.color }} strokeOpacity={0.85} isAnimationActive={false} />

            {/* Moving average overlay */}
            <Line type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.68)" strokeWidth={2}
              dot={false} activeDot={false} strokeDasharray="5 3" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Summary stats row */}
        <div className="grid grid-cols-4 gap-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'First ep.', value: data[0]?.value.toFixed(2) },
            { label: 'Last ep.',  value: data[data.length - 1]?.value.toFixed(2) },
            { label: 'Min',       value: Math.min(...data.map(d => d.value)).toFixed(2) },
            { label: 'Max',       value: Math.max(...data.map(d => d.value)).toFixed(2) },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>{label}</div>
              <div className="text-[15px] font-bold tabular-nums" style={{ color: algo.color }}>{value}</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{meta.unit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Analytics Charts ─────────────────────────────────────────────────────────

const CHART_GRID = 'rgba(255,255,255,0.05)'
const CHART_AXIS  = { fill: 'rgba(255,255,255,0.28)', fontSize: 10 }
const CHART_AXIS_LINE = { stroke: 'rgba(255,255,255,0.08)' }
const CHART_TICK_LINE = { stroke: 'rgba(255,255,255,0.08)' }

// Shared tooltip shell
const ChartTooltip = ({ active, payload, label, xLabel, rows }: {
  active?: boolean; payload?: any[]; label?: any
  xLabel: string
  rows: { key: string; label: string; color: string; unit: string }[]
}) => {
  if (!active || !payload?.length) return null
  const byKey = Object.fromEntries(payload.map((p: any) => [p.dataKey, p.value]))
  return (
    <div style={{ background: 'rgba(4,9,22,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ color: 'rgba(255,255,255,0.38)', marginBottom: 4 }}>{xLabel} {label}</p>
      {rows.map(({ key, label: rl, color, unit }) =>
        byKey[key] !== undefined
          ? <p key={key} style={{ color }}>{rl}: <b>{Number(byKey[key]).toFixed(2)}</b> {unit}</p>
          : null
      )}
    </div>
  )
}

// 1 — Training Curve
const TrainingCurveChart = ({ algo }: { algo: AlgoData }) => {
  const data = algo.system.training
  if (!data.length) return (
    <GlassCard className="p-5 flex flex-col gap-2 col-span-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)' }}>Training Curve</span>
        <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)' }}>No training phase</span>
      </div>
      <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Selfish Routing is a rule-based baseline — it requires no training and has no reward curve.
      </p>
    </GlassCard>
  )
  return (
    <GlassCard className="p-5 flex flex-col gap-3 col-span-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)' }}>Training Curve</span>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
            Cumulative reward per episode · shaded area = seed confidence band
          </p>
        </div>
        <div className="flex items-center gap-4">
          {[
            { color: algo.color, label: 'Mean reward' },
            { color: 'rgba(255,255,255,0.6)', label: 'Moving avg.', dashed: true },
          ].map(({ color, label, dashed }) => (
            <div key={label} className="flex items-center gap-1.5">
              <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 2' : undefined} /></svg>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-sm" style={{ background: algo.color, opacity: 0.18 }} />
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Conf. band</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 20 }}>
          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 4" />
          <XAxis dataKey="episode" tick={CHART_AXIS} tickLine={CHART_TICK_LINE} axisLine={CHART_AXIS_LINE}
            label={{ value: 'Episode', position: 'insideBottom', offset: -12, fill: 'rgba(255,255,255,0.28)', fontSize: 11 }}
            interval={Math.floor(data.length / 8)} />
          <YAxis tick={CHART_AXIS} tickLine={CHART_TICK_LINE} axisLine={CHART_AXIS_LINE} width={52}
            label={{ value: 'Reward', angle: -90, position: 'insideLeft', offset: 14, fill: 'rgba(255,255,255,0.28)', fontSize: 11 }} />
          <Tooltip content={<ChartTooltip xLabel="Ep." rows={[
            { key: 'reward', label: 'Reward', color: algo.color, unit: '' },
            { key: 'ma',     label: 'MA-10',  color: 'rgba(255,255,255,0.65)', unit: '' },
          ]} />} />
          <Area type="monotone" dataKey="hi" stroke="none" fill={algo.color} fillOpacity={0.14} dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
          <Area type="monotone" dataKey="lo" stroke="none" fill="#040916" fillOpacity={1} dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
          <Line type="monotone" dataKey="reward" stroke={algo.color} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeOpacity={0.85} isAnimationActive={false} />
          <Line type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.6)" strokeWidth={2} dot={false} activeDot={false} strokeDasharray="5 3" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </GlassCard>
  )
}

// 2 — Decision Latency
const LatencyChart = ({ algo }: { algo: AlgoData }) => (
  <GlassCard className="p-5 flex flex-col gap-3">
    <div>
      <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)' }}>Decision Latency</span>
      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
        Inference time per step (ms) · ISO 25010 Performance Efficiency
      </p>
    </div>
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={algo.system.latency} margin={{ top: 4, right: 12, left: 0, bottom: 20 }}>
        <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 4" />
        <XAxis dataKey="step" tick={CHART_AXIS} tickLine={CHART_TICK_LINE} axisLine={CHART_AXIS_LINE}
          label={{ value: 'Step', position: 'insideBottom', offset: -12, fill: 'rgba(255,255,255,0.28)', fontSize: 11 }}
          interval={Math.floor(algo.system.latency.length / 6)} />
        <YAxis tick={CHART_AXIS} tickLine={CHART_TICK_LINE} axisLine={CHART_AXIS_LINE} width={40}
          label={{ value: 'ms', angle: -90, position: 'insideLeft', offset: 14, fill: 'rgba(255,255,255,0.28)', fontSize: 11 }} />
        <Tooltip content={<ChartTooltip xLabel="Step" rows={[
          { key: 'latency', label: 'Latency', color: algo.color, unit: 'ms' },
          { key: 'ma',      label: 'MA-8',    color: 'rgba(255,255,255,0.65)', unit: 'ms' },
        ]} />} />
        <Area type="monotone" dataKey="latency" stroke={algo.color} strokeWidth={1.5}
          fill={algo.color} fillOpacity={0.1} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.58)" strokeWidth={1.5}
          dot={false} activeDot={false} strokeDasharray="5 3" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </GlassCard>
)

// 3 — CPU Utilisation
const CpuChart = ({ algo }: { algo: AlgoData }) => (
  <GlassCard className="p-5 flex flex-col gap-3">
    <div>
      <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)' }}>CPU Utilization</span>
      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
        System CPU (%) over simulation runtime · real-world feasibility
      </p>
    </div>
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={algo.system.cpu} margin={{ top: 4, right: 12, left: 0, bottom: 20 }}>
        <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 4" />
        <XAxis dataKey="step" tick={CHART_AXIS} tickLine={CHART_TICK_LINE} axisLine={CHART_AXIS_LINE}
          label={{ value: 'Step', position: 'insideBottom', offset: -12, fill: 'rgba(255,255,255,0.28)', fontSize: 11 }}
          interval={Math.floor(algo.system.cpu.length / 6)} />
        <YAxis tick={CHART_AXIS} tickLine={CHART_TICK_LINE} axisLine={CHART_AXIS_LINE} width={40} domain={[0, 100]}
          label={{ value: '%', angle: -90, position: 'insideLeft', offset: 14, fill: 'rgba(255,255,255,0.28)', fontSize: 11 }} />
        <Tooltip content={<ChartTooltip xLabel="Step" rows={[
          { key: 'cpu', label: 'CPU', color: algo.color, unit: '%' },
          { key: 'ma',  label: 'MA-8', color: 'rgba(255,255,255,0.65)', unit: '%' },
        ]} />} />
        <Area type="monotone" dataKey="cpu" stroke={algo.color} strokeWidth={1.5}
          fill={algo.color} fillOpacity={0.12} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.58)" strokeWidth={1.5}
          dot={false} activeDot={false} strokeDasharray="5 3" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </GlassCard>
)

// ─── Algorithm Detail Page ─────────────────────────────────────────────────────


const AlgoDetailPage = ({ algo, mapSize, trafficScale }: {
  algo: AlgoData; mapSize: string; trafficScale: string
}) => {
  const [openModal, setOpenModal] = useState<EpisodeMetricKey | null>(null)

  return (
  <div className="p-6 space-y-5 overflow-y-auto" style={{ height: '100%' }}>
    {/* Episode detail modal */}
    {openModal && (
      <EpisodeDetailModal algo={algo} metricKey={openModal} onClose={() => setOpenModal(null)} />
    )}

    {/* Header */}
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold leading-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>{algo.label}</h2>
      </div>
      <div className="flex items-center gap-2 flex-1">
        {mapSize && (
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
            {MAP_LABELS[mapSize] || mapSize}
          </span>
        )}
        {trafficScale && (
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
            {TRAFFIC_LABELS[trafficScale] || trafficScale}
          </span>
        )}
      </div>
      <div className="px-4 py-1.5 rounded-full text-[12px] font-bold flex-shrink-0"
        style={{ background: algo.colorDim, color: algo.color, border: `1px solid ${algo.border}` }}>
        {algo.efficiency}% Efficiency Score
      </div>
    </div>

    {/* KPI Row — click any card to view per-episode trend */}
    <div className="grid grid-cols-4 gap-4">
      <KpiCard label="Avg. Travel Time" abbr="ATT" value={algo.travelTime} unit="min"
        color={algo.color} colorDim={algo.colorDim} borderColor={algo.border}
        change={algo.changes.travelTime} lowerBetter sparkData={algo.sparklines.travelTime}
        onClick={() => setOpenModal('travelTime')}
        description="The mean time it takes for a vehicle to complete its route from entry to exit, across all vehicles in the simulation." />
      <KpiCard label="Avg. Wait Time" abbr="AWT" value={algo.waitTime} unit="sec"
        color={algo.color} colorDim={algo.colorDim} borderColor={algo.border}
        change={algo.changes.waitTime} lowerBetter sparkData={algo.sparklines.waitTime}
        onClick={() => setOpenModal('waitTime')}
        description="The mean time vehicles spent fully stopped in traffic. High values indicate congestion or poor routing decisions." />
      <KpiCard label="Throughput" abbr="TPT" value={algo.throughput.toLocaleString()} unit="veh/hr"
        color={algo.color} colorDim={algo.colorDim} borderColor={algo.border}
        change={algo.changes.throughput} sparkData={algo.sparklines.throughput}
        onClick={() => setOpenModal('throughput')}
        description="The number of vehicles that successfully completed their routes per minute. Higher values indicate better overall traffic flow." />
      <KpiCard label="Real-time Factor" abbr="RTF" value={algo.speed.toFixed(2)} unit="x"
        color={algo.color} colorDim={algo.colorDim} borderColor={algo.border}
        change={algo.changes.speed} sparkData={algo.sparklines.speed}
        onClick={() => setOpenModal('speed')}
        descriptionSide="left"
        description="The ratio of simulation time to actual wall-clock time. A value of 1.0 means the simulation runs in real time; higher values indicate faster-than-real-time execution." />
    </div>

    {/* Charts row: left column stack + Map Player */}
    <div className="grid grid-cols-3 gap-4">
      {/* Left column: Algorithm Overview + Heatmap stacked */}
      <div className="flex flex-col gap-4">
        <GlassCard className="p-5 flex flex-col gap-3">
          <h3 className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)' }}>Algorithm Overview</h3>
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.52)' }}>
            {algo.description}
          </p>
          {algo.convergence !== null && (
            <div className="pt-3 grid grid-cols-2 gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.28)' }}>Convergence</div>
                <div className="text-[17px] font-bold tabular-nums" style={{ color: algo.color }}>Ep. {algo.convergence}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.28)' }}>Cumulative Reward</div>
                <div className="text-[17px] font-bold tabular-nums" style={{ color: algo.color }}>{algo.reward}</div>
              </div>
            </div>
          )}
        </GlassCard>

        <CongestionHeatmap algo={algo} />
      </div>

      {/* Map Player (col 2–3) */}
      <MapPlayer algo={algo} mapSize={mapSize} />
    </div>

    {/* Analytics row */}
    {algo.id === 'selfish' ? (
      <div className="grid grid-cols-2 gap-4">
        <LatencyChart algo={algo} />
        <CpuChart algo={algo} />
      </div>
    ) : (
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <TrainingCurveChart algo={algo} />
        </div>
        <LatencyChart algo={algo} />
        <CpuChart algo={algo} />
      </div>
    )}
  </div>
  )
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

const NAV: { id: Page; label: string; d: string }[] = [
  {
    id: 'summary', label: 'Summary',
    d: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm14 3.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z',
  },
  {
    id: 'civiq', label: 'Civiq',
    d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  },
  {
    id: 'selfish', label: 'Selfish Routing',
    d: 'M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-1.447-.894L15 9m0 8V9m0 0L9 7',
  },
  {
    id: 'qmix', label: 'Monolithic QMIX',
    d: 'M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10',
  },
]

const PAGE_COLOR: Record<Page, string> = {
  summary: '#60A5FA',
  civiq: ALGO.civiq.color,
  selfish: ALGO.selfish.color,
  qmix: ALGO.qmix.color,
}

interface SidebarProps {
  activePage: Page
  setActivePage: (p: Page) => void
  mapSize: string
  trafficScale: string
  algorithm1: string
}

const Sidebar = ({ activePage, setActivePage, mapSize, trafficScale, algorithm1 }: SidebarProps) => (
  <div className="flex flex-col flex-shrink-0"
    style={{ width: '248px', background: 'rgba(0,0,0,0.2)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

    {/* Analytics nav */}
    <div className="px-5 pt-6 pb-3 flex-shrink-0">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.28)' }}>
        Analytics
      </span>
    </div>

    <nav className="px-3 space-y-1 flex-shrink-0">
      {NAV.map((item) => {
        const isActive = activePage === item.id
        const col = PAGE_COLOR[item.id]
        return (
          <button key={item.id} onClick={() => setActivePage(item.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200"
            style={{
              background: isActive ? `${col}18` : 'transparent',
              border: isActive ? `1px solid ${col}40` : '1px solid transparent',
              color: isActive ? col : 'rgba(255,255,255,0.45)',
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={item.d} />
            </svg>
            <span className="text-[13px] font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>

    {/* Divider */}
    <div className="mx-4 my-4 flex-shrink-0" style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />

    {/* Simulation Controls section label */}
    <div className="px-5 pb-3 flex-shrink-0">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.28)' }}>
        Simulation Controls
      </span>
    </div>

    {/* Controls */}
    <div className="px-4 flex-shrink-0">
      <SimulationControls
        darkMode
        vertical
        hideHeader
        initialMapSize={mapSize}
        initialTrafficScale={trafficScale}
        initialAlgorithm={algorithm1 === 'hierarchical_qmix' ? 'hierarchical_qmix'
          : algorithm1 === 'monolithic_qmix' ? 'monolithic_qmix'
          : algorithm1 === 'selfish_routing' ? 'selfish_routing'
          : undefined}
      />
    </div>

  </div>
)

// ─── Labels ────────────────────────────────────────────────────────────────────

const MAP_LABELS: Record<string, string> = {
  '2km': '2 km²', '0.75km': '0.75 km²', '4x4': '4×4 Grid (2.25 km²)',
}
const TRAFFIC_LABELS: Record<string, string> = {
  free_flow: 'Free Flow (LOS A)', stable_flow: 'Stable Flow (LOS C)', forced_flow: 'Forced Flow (LOS E)',
}

// ─── Main Export ───────────────────────────────────────────────────────────────

function SimulationDashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const mapSize = searchParams.get('mapSize') || ''
  const trafficScale = searchParams.get('trafficScale') || ''
  const view = searchParams.get('view') || ''
  const algorithm1 = searchParams.get('algorithm1') || ''
  const algorithm2 = searchParams.get('algorithm2') || ''

  const algoToPage = (algo: string): Page => {
    if (algo === 'hierarchical_qmix') return 'civiq'
    if (algo === 'monolithic_qmix') return 'qmix'
    if (algo === 'selfish_routing') return 'selfish'
    return 'summary'
  }
  const [activePage, setActivePage] = useState<Page>(() => algoToPage(algorithm1))

  // Keep active tab in sync when URL params change (e.g. Run from sidebar controls)
  useEffect(() => {
    setActivePage(algoToPage(algorithm1))
  }, [algorithm1])

  useEffect(() => {
    if (!mapSize || !trafficScale || !view || !algorithm1) { router.push('/'); return }
    const validMapSizes = ['2km', '0.75km', '4x4']
    const validTrafficScales = ['free_flow', 'stable_flow', 'forced_flow']
    const validViews = ['focused', 'comparative']
    const validAlgorithms = ['selfish_routing', 'monolithic_qmix', 'hierarchical_qmix']
    if (
      !validMapSizes.includes(mapSize) ||
      !validTrafficScales.includes(trafficScale) ||
      !validViews.includes(view) ||
      !validAlgorithms.includes(algorithm1)
    ) { router.push('/'); return }
    if (view === 'comparative' && (!algorithm2 || algorithm1 === algorithm2 || !validAlgorithms.includes(algorithm2))) {
      router.push('/')
    }
  }, [mapSize, trafficScale, view, algorithm1, algorithm2, router])

  return (
    <main className="w-full h-screen overflow-hidden" style={{ position: 'relative' }}>
      {/* Base gradient */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, #060112 0%, #0b0320 40%, #040c1c 100%)', zIndex: -1 }} />
      <AnimatedBackground />

      {/* Outer wrapper */}
      <div className="flex items-stretch justify-center"
        style={{ height: '100vh', padding: 'clamp(10px, 1.2vw, 18px)', zIndex: 2, position: 'relative', overflowX: 'auto' }}>

        {/* OBU Bezel */}
        <div className="relative w-full flex flex-col" style={{
          minWidth: '1400px', maxWidth: '1640px',
          background: 'rgba(8, 14, 32, 0.48)',
          backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          borderRadius: '24px', padding: '12px',
          border: '1px solid rgba(255,255,255,0.11)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.3)',
        }}>
          {/* Side screws */}
          {['left-2', 'right-2'].map((side) => (
            <div key={side} className={`absolute ${side} top-1/2 -translate-y-1/2 flex flex-col gap-2.5 pointer-events-none`}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full"
                  style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)' }} />
              ))}
            </div>
          ))}

          {/* Screen */}
          <div className="relative flex flex-col overflow-hidden"
            style={{
              flex: 1,
              background: 'rgba(6, 11, 26, 0.45)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
            {/* Top gloss */}
            <div className="absolute inset-x-0 top-0 h-20 pointer-events-none rounded-t-[14px]"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)' }} />

            {/* Status bar */}
            <StatusBar />

            {/* Body: Sidebar + Content */}
            <div className="flex overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
              <Sidebar
                activePage={activePage}
                setActivePage={setActivePage}
                mapSize={mapSize}
                trafficScale={trafficScale}
                algorithm1={algorithm1}
              />
              {/* Content pane: fixed blob layer + scrollable content on top */}
              <div className="flex-1 relative" style={{
                minHeight: 0,
                overflow: 'hidden',
                background: 'rgba(4, 9, 22, 0.82)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderLeft: '1px solid rgba(255,255,255,0.07)',
              }}>
                {/* Animated colour blobs — fixed behind content */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
                  <div className="absolute rounded-full" style={{
                    width: 500, height: 500, top: '-120px', left: '-80px',
                    background: 'radial-gradient(circle at 40% 40%, rgba(6,182,212,0.28) 0%, transparent 70%)',
                    filter: 'blur(60px)', animation: 'blob1 16s ease-in-out infinite', animationDelay: '-3s',
                  }} />
                  <div className="absolute rounded-full" style={{
                    width: 460, height: 460, bottom: '-100px', right: '-60px',
                    background: 'radial-gradient(circle at 60% 55%, rgba(139,92,246,0.24) 0%, transparent 70%)',
                    filter: 'blur(60px)', animation: 'blob2 20s ease-in-out infinite', animationDelay: '-8s',
                  }} />
                  <div className="absolute rounded-full" style={{
                    width: 360, height: 360, top: '35%', left: '50%',
                    background: 'radial-gradient(circle at 50% 50%, rgba(37,99,235,0.18) 0%, transparent 70%)',
                    filter: 'blur(50px)', animation: 'blob3 18s ease-in-out infinite', animationDelay: '-12s',
                  }} />
                </div>

                {/* Scrollable page content */}
                <div className="absolute inset-0 overflow-y-auto" style={{ zIndex: 1 }}>
                  {activePage === 'summary' && <SummaryPage />}
                  {activePage === 'civiq' && <AlgoDetailPage algo={ALGO.civiq} mapSize={mapSize} trafficScale={trafficScale} />}
                  {activePage === 'selfish' && <AlgoDetailPage algo={ALGO.selfish} mapSize={mapSize} trafficScale={trafficScale} />}
                  {activePage === 'qmix' && <AlgoDetailPage algo={ALGO.qmix} mapSize={mapSize} trafficScale={trafficScale} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function SimulationDashboard() {
  return (
    <Suspense fallback={<main className="w-full h-screen" style={{ background: '#060112' }} />}>
      <SimulationDashboardContent />
    </Suspense>
  )
}
