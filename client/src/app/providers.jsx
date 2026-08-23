import { StrictMode } from 'react'
import { AuthProvider } from '@/services/auth/AuthProvider.jsx'
import { SocketProvider } from '@/services/socket/SocketProvider.jsx'
import { CallProvider } from '@/features/calls/context/CallContext.jsx'
import { CallHistoryProvider } from '@/features/calls/context/CallHistoryProvider.jsx'
import { RuntimeConfigProvider, useRuntimeConfig } from '@/config/RuntimeConfigProvider.js'
import { RuntimeConfigBoundary } from '@/config/RuntimeCapabilityGate.js'

const OptionalCallProviders = ({ children }) => {
  const { capabilities } = useRuntimeConfig()

  if (!capabilities.calls) return children

  return (
    <CallProvider>
      <CallHistoryProvider>{children}</CallHistoryProvider>
    </CallProvider>
  )
}

export const AppProviders = ({ children }) => {
  return (
    <StrictMode>
      <RuntimeConfigProvider target={import.meta.env?.VITE_TARGET}>
        <RuntimeConfigBoundary>
          <AuthProvider>
            <SocketProvider>
              <OptionalCallProviders>{children}</OptionalCallProviders>
            </SocketProvider>
          </AuthProvider>
        </RuntimeConfigBoundary>
      </RuntimeConfigProvider>
    </StrictMode>
  )
}
