import { Link } from 'react-router-dom'
import { Eye, FileText, ShieldCheck, ArrowRight } from 'lucide-react'

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#101C23] text-[#F4F7F7] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2A444E] bg-[#1C3038]/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#367F77] flex items-center justify-center text-[#F4F7F7]">
              <Eye className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-[#F4F7F7]">
              CivicEye AI
            </span>
          </div>
          <span className="text-xs font-medium text-[#91C8BD]">
            Your City. Our Vision.
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col justify-center max-w-5xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero Heading */}
        <section className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#F4F7F7]">
            CivicEye AI
          </h1>
          <p className="text-xl sm:text-2xl font-semibold text-[#91C8BD] mt-1.5">
            Your City. Our Vision.
          </p>
          <p className="text-sm sm:text-base text-[#AABDC2] mt-3">
            Smarter roads. Cleaner cities. Powered by AI.
          </p>
        </section>

        {/* Two Main Portal Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
          {/* Card 1: Citizen Portal */}
          <div className="bg-[#1C3038] border border-[#2A444E] hover:border-[#367F77] rounded-2xl p-6 sm:p-7 flex flex-col justify-between transition-colors shadow-sm">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#367F77]/25 border border-[#367F77]/50 flex items-center justify-center text-[#91C8BD] mb-4">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-[#F4F7F7]">
                Citizen Portal
              </h2>
              <p className="text-sm text-[#AABDC2] mt-1.5">
                Report issues. Track progress.
              </p>
            </div>

            <div className="mt-6">
              <Link
                to="/citizen"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-sm font-semibold transition-colors"
              >
                <span>Open Portal</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card 2: Government Portal */}
          <div className="bg-[#1C3038] border border-[#2A444E] hover:border-[#367F77] rounded-2xl p-6 sm:p-7 flex flex-col justify-between transition-colors shadow-sm">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#367F77]/25 border border-[#367F77]/50 flex items-center justify-center text-[#91C8BD] mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-[#F4F7F7]">
                Government Portal
              </h2>
              <p className="text-sm text-[#AABDC2] mt-1.5">
                Monitor. Manage. Resolve.
              </p>
            </div>

            <div className="mt-6">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#101C23] hover:bg-[#367F77] border border-[#367F77] text-[#F4F7F7] text-sm font-semibold transition-colors"
              >
                <span>Staff Login</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Compact Footer */}
      <footer className="border-t border-[#2A444E] bg-[#1C3038]/60 py-4 px-4 sm:px-6 text-xs text-[#AABDC2]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CivicEye AI · Municipal Road & Civic Monitoring</span>
          <span>Anonymous citizen reporting · Role-protected staff portal</span>
        </div>
      </footer>
    </div>
  )
}
