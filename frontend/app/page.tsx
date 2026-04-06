'use client'

import { useRouter } from 'next/navigation'
import { AnimatedBackground } from '@/components/AnimatedBackground'
import { SimulationControls } from '@/components/SimulationControls'
import { AboutSection } from '@/components/AboutSection'
import { ResearchersSection } from '@/components/ResearchersSection'
import { Footer } from '@/components/Footer'

const StatusBar = () => {
  const router = useRouter()
  const NAV_LINKS = [
    { label: 'About',        href: '/#about' },
    { label: 'The Research', href: '/research' },
    { label: 'Contact Us',   href: '/#contact' },
  ]
  return (
    <div
      className="flex items-center justify-between px-7 py-2.5 flex-shrink-0"
      style={{ background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Left — logo (non-interactive on home, already here) */}
      <div className="flex items-center gap-2.5">
        <img src="/icons/civiq-logo.png" alt="Civiq" className="w-5 h-5 object-contain brightness-0 invert opacity-80" />
        <span className="font-bold text-[13px] tracking-widest" style={{ color: 'rgba(255,255,255,0.75)' }}>
          CIVIQ
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ·&nbsp; A Hierarchical Multi-Agent Coordination Framework
        </span>
      </div>

      {/* Right — nav buttons */}
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

export default function Home() {
  return (
    <main className="w-full">
      {/* ── Base gradient ── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, #060112 0%, #0b0320 40%, #040c1c 100%)',
          zIndex: -1,
        }}
      />

      {/* ── Animated blobs ── */}
      <AnimatedBackground />

      {/* ── HERO SECTION ── */}
      <section
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        style={{ zIndex: 2, padding: 'clamp(16px, 3vw, 48px)' }}
      >
        {/* ── OBU device frame — glassmorphism bezel ── */}
        <div
          className="relative w-full mx-auto"
          style={{
            maxWidth: 'min(1160px, 100%)',
            background: 'rgba(8, 14, 32, 0.48)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            borderRadius: '24px',
            padding: '12px',
            border: '1px solid rgba(255,255,255,0.11)',
            boxShadow:
              '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.3)',
          }}
        >
          {/* Side screw details — inset so they don't overflow */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 pointer-events-none">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full"
                style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)' }} />
            ))}
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 pointer-events-none">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full"
                style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)' }} />
            ))}
          </div>

          {/* ── Screen — glassmorphism panel ── */}
          <div
            className="relative w-full flex flex-col overflow-hidden"
            style={{
              background: 'rgba(6, 11, 26, 0.62)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Subtle top-gloss reflection */}
            <div
              className="absolute inset-x-0 top-0 h-24 pointer-events-none rounded-t-[14px]"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)' }}
            />

            {/* Status bar */}
            <StatusBar />

            {/* ── Content ── */}
            <div className="flex flex-col items-center gap-5"
              style={{ padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px) clamp(24px, 3vw, 44px)' }}>

              {/* Title */}
              <div className="text-center w-full" style={{ maxWidth: '780px' }}>
                <h1
                  className="font-extrabold leading-[1.1] mb-4 select-none"
                  style={{
                    fontSize: 'clamp(22px, 3vw, 42px)',
                    backgroundImage: 'linear-gradient(140deg, #93C5FD 0%, #60A5FA 40%, #38BDF8 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Solving Urban Congestion Through Hierarchical Coordination.
                </h1>

                <p className="leading-[1.75] mb-5" style={{ fontSize: 'clamp(12px, 1.1vw, 12px)', color: 'rgba(255,255,255,0.52)' }}>
                  An undergraduate thesis applying{' '}
                  <span className="font-semibold" style={{ color: '#38BDF8' }}>
                    Hierarchical Multi-Agent Reinforcement Learning
                  </span>{' '}
                  to urban traffic management. Vehicles act as intelligent agents that
                  cooperatively learn routing decisions — reducing congestion across a simulated road network.
                </p>

                <div className="flex gap-3 justify-center">
                  <a
                    href="#about"
                    className="font-semibold rounded-full transition-all duration-200 text-white"
                    style={{ padding: 'clamp(8px,1vw,10px) clamp(16px,2vw,24px)', fontSize: 'clamp(11px,1vw,13.5px)', background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', boxShadow: '0 4px 20px rgba(59,130,246,0.45)' }}
                    onMouseEnter={(e) => { ;(e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(59,130,246,0.65)'; ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
                    onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(59,130,246,0.45)'; ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
                  >
                    Explore Research
                  </a>
                  <a
                    href="#"
                    className="font-semibold rounded-full transition-all duration-200"
                    style={{ padding: 'clamp(8px,1vw,10px) clamp(16px,2vw,24px)', fontSize: 'clamp(11px,1vw,13.5px)', background: 'rgba(56,189,248,0.08)', border: '1.5px solid rgba(56,189,248,0.4)', color: '#38BDF8' }}
                    onMouseEnter={(e) => { ;(e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.15)' }}
                    onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.08)' }}
                  >
                    Thesis Paper
                  </a>
                </div>
              </div>

              {/* Divider */}
              <div className="w-full" style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent)' }} />

              {/* Simulation controls — glass card */}
              <div
                className="w-full"
                style={{
                  maxWidth: '860px',
                  background: 'rgba(255,255,255,0.04)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: '18px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                  padding: 'clamp(16px, 2vw, 24px)',
                }}
              >
                <SimulationControls darkMode />
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT SECTION ── */}
      <section id="about" className="relative w-full py-16 bg-white" style={{ zIndex: 2 }}>
        <div className="max-w-[1400px] mx-auto px-6">
          <AboutSection />
        </div>
      </section>

      {/* ── RESEARCHERS SECTION ── */}
      <section
        id="researchers"
        className="relative w-full py-20"
        style={{ background: '#f9f9f9', zIndex: 2 }}
      >
        <div className="max-w-7xl mx-auto px-8">
          <ResearchersSection />
        </div>
      </section>

      {/* ── FOOTER ── */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <Footer />
      </div>
    </main>
  )
}
