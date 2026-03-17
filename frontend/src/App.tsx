import type { ReactNode } from 'react'
import {
  OrganizationSwitcher,
  SignIn,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/clerk-react'
import { Dashboard } from './components/Dashboard'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-violet-500/20 ring-1 ring-violet-500/40" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-slate-100">
                InfraPulse
              </div>
              <div className="text-xs text-slate-400">Predictive InfraPulse AI Digital Twin</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:block">
              <OrganizationSwitcher />
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-7xl flex-1 flex-col px-4 py-4">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-4 py-8">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-slate-100">InfraPulse</h1>
            <p className="mt-1 text-sm text-slate-400">
              Sign in to view your infrastructure dashboard and 3D digital twin.
            </p>
          </div>
          <SignIn
            appearance={{
              elements: {
                rootBox: 'mx-auto',
                card: 'shadow-xl border border-slate-800 bg-slate-900/90',
              },
            }}
          />
        </div>
      </SignedOut>
      <SignedIn>
        <Shell>
          <Dashboard />
        </Shell>
      </SignedIn>
    </>
  )
}
