import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ArrowRight, Camera, Cpu, MapPin, Building2, CheckCircle2, Bus } from 'lucide-react'

const STATS = [
  { label: 'Issues Detected', target: 1247, suffix: '+' },
  { label: 'Resolution Rate', target: 89, suffix: '%' },
  { label: 'Active Buses', target: 12, suffix: '' },
  { label: 'Departments', target: 5, suffix: '' },
]

const HOW_IT_WORKS = [
  {
    icon: <Camera size={24} />,
    title: 'Bus Camera',
    desc: 'HD cameras mounted on PMPML buses continuously capture city roads',
    color: 'teal',
  },
  {
    icon: <Cpu size={24} />,
    title: 'AI Detection',
    desc: 'Vision AI models detect potholes, garbage, fallen trees & more in real-time',
    color: 'blue',
  },
  {
    icon: <MapPin size={24} />,
    title: 'Geo-tagged Complaint',
    desc: 'Every detection is auto-tagged with GPS coords and creates a complaint',
    color: 'amber',
  },
  {
    icon: <Building2 size={24} />,
    title: 'Department Action',
    desc: 'Complaints route to the right department for rapid response and resolution',
    color: 'emerald',
  },
]

const CATEGORIES = [
  { emoji: '🕳️', name: 'Potholes', desc: 'Dangerous road cavities detected via computer vision', color: 'from-orange-500/20' },
  { emoji: '🗑️', name: 'Garbage', desc: 'Illegal dump sites and roadside waste accumulation', color: 'from-red-500/20' },
  { emoji: '📦', name: 'Dustbins', desc: 'Overflowing public dustbins needing urgent attention', color: 'from-amber-500/20' },
  { emoji: '🌳', name: 'Fallen Trees', desc: 'Storm-damaged or diseased trees blocking roads', color: 'from-emerald-500/20' },
  { emoji: '💧', name: 'Waterlogging', desc: 'Flooded roads and drainage system failures', color: 'from-blue-500/20' },
  { emoji: '💡', name: 'Streetlights', desc: 'Non-functional street lights creating safety hazards', color: 'from-yellow-500/20' },
]

function useCountUp(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!start) return
    const startTime = performance.now()
    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration, start])

  return count
}

function AnimatedStat({ stat, started }: { stat: typeof STATS[0]; started: boolean }) {
  const value = useCountUp(stat.target, 2000, started)
  return (
    <div className="text-center">
      <div className="text-3xl md:text-4xl font-bold text-white">
        {value.toLocaleString()}
        <span className="text-teal-400">{stat.suffix}</span>
      </div>
      <div className="text-slate-400 text-sm mt-1">{stat.label}</div>
    </div>
  )
}

export default function Landing() {
  const [statsStarted, setStatsStarted] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsStarted(true) },
      { threshold: 0.3 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center">
            <Eye size={16} className="text-white" />
          </div>
          <span className="font-bold text-white">CivicEye AI</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#categories" className="hover:text-white transition-colors">Categories</a>
          <a href="#stats" className="hover:text-white transition-colors">Impact</a>
        </div>
        <Link
          to="/login"
          className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Login
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 py-20 md:py-32 text-center">
        <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-full px-4 py-1.5 text-teal-400 text-sm mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 live-dot" />
          Live AI-powered city monitoring
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6">
          Every Bus Becomes a<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
            Smart City Inspector
          </span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          CivicEye AI transforms Pune's public bus fleet into an intelligent infrastructure
          monitoring network — detecting civic issues, routing complaints, and driving faster resolutions.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/dashboard"
            className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-6 py-3 rounded-xl font-semibold text-lg transition-all hover:scale-105"
          >
            View Live Dashboard
            <ArrowRight size={20} />
          </Link>
          <a
            href="#how-it-works"
            className="flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-6 py-3 rounded-xl font-semibold text-lg transition-all"
          >
            Learn More
          </a>
        </div>

        {/* Hero visual */}
        <div className="mt-16 relative">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-500 text-xs ml-2">CivicEye Dashboard — Live</span>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              {[
                { label: 'Total Issues', value: '1,247', color: 'teal' },
                { label: 'In Progress', value: '89', color: 'amber' },
                { label: 'Resolved', value: '1,104', color: 'emerald' },
                { label: 'Critical', value: '14', color: 'red' },
              ].map((s) => (
                <div key={s.label} className="bg-slate-800 rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold text-${s.color}-400`}>{s.value}</div>
                  <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="bg-slate-800 rounded-lg h-32 flex items-center justify-center text-slate-600 text-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'radial-gradient(circle at 20% 60%, #14b8a6 0%, transparent 40%), radial-gradient(circle at 80% 30%, #3b82f6 0%, transparent 40%)',
                }}
              />
              <div className="relative flex items-center gap-2">
                <Bus size={20} className="text-teal-400" />
                <span className="text-slate-400">Pune city map with live complaint markers</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" ref={statsRef} className="bg-slate-900 border-y border-slate-800 py-16">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat) => (
            <AnimatedStat key={stat.label} stat={stat} started={statsStarted} />
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How It Works</h2>
          <p className="text-slate-400 max-w-lg mx-auto">
            A seamless pipeline from detection to resolution — powered by AI and real-time data
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-12 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-teal-500/40 via-blue-500/40 to-emerald-500/40 z-0" />
          {HOW_IT_WORKS.map((step, idx) => (
            <div key={step.title} className="relative z-10 text-center">
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
                idx === 0 ? 'bg-teal-500/20 text-teal-400' :
                idx === 1 ? 'bg-blue-500/20 text-blue-400' :
                idx === 2 ? 'bg-amber-500/20 text-amber-400' :
                'bg-emerald-500/20 text-emerald-400'
              }`}>
                {step.icon}
              </div>
              <div className="w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center text-xs text-slate-400 mx-auto mb-3">
                {idx + 1}
              </div>
              <h3 className="text-white font-semibold mb-2">{step.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="py-20 bg-slate-900 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Problem Categories</h2>
            <p className="text-slate-400 max-w-lg mx-auto">
              Our AI detects 6 major infrastructure issues affecting Pune citizens daily
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.name}
                className={`bg-gradient-to-br ${cat.color} to-transparent border border-slate-700/50 rounded-xl p-5 card-hover`}
              >
                <div className="text-3xl mb-3">{cat.emoji}</div>
                <h3 className="text-white font-semibold mb-1">{cat.name}</h3>
                <p className="text-slate-400 text-sm">{cat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 max-w-4xl mx-auto px-6 text-center">
        <div className="bg-gradient-to-br from-teal-500/10 to-emerald-500/10 border border-teal-500/20 rounded-2xl p-10">
          <CheckCircle2 size={40} className="text-teal-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Inspect Your City?
          </h2>
          <p className="text-slate-400 mb-8 max-w-xl mx-auto">
            Join officers and citizens using CivicEye AI to make Pune's infrastructure safer and cleaner.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all hover:scale-105"
          >
            View Live Dashboard
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-slate-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 bg-teal-500 rounded flex items-center justify-center">
            <Eye size={12} className="text-white" />
          </div>
          <span className="text-white font-medium">CivicEye AI</span>
        </div>
        <p>Smart City Infrastructure Monitoring · Pune, Maharashtra</p>
      </footer>
    </div>
  )
}
