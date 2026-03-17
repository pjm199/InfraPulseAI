import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    {clerkPubKey ? (
      <ClerkProvider publishableKey={clerkPubKey}>
        <App />
      </ClerkProvider>
    ) : (
      <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: '32rem', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>InfraPulse</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to your <strong>root</strong> <code>.env</code> and
          restart <code>npm run dev</code>. The frontend loads env from the repo root.
        </p>
      </div>
    )}
  </StrictMode>,
)
