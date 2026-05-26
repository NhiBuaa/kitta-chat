import { StrictMode } from 'react'
import { AuthProvider } from '@/services/auth/AuthProvider.jsx'
import { SocketProvider } from '@/services/socket/SocketProvider.jsx'
import { CallProvider } from '@/features/calls/context/CallContext.jsx'
import { CallHistoryProvider } from '@/features/calls/context/CallHistoryProvider.jsx'

export const AppProviders = ({ children }) => {
  return (
    <StrictMode>
      <AuthProvider>
        <SocketProvider>
          <CallProvider>
            <CallHistoryProvider>{children}</CallHistoryProvider>
          </CallProvider>
        </SocketProvider>
      </AuthProvider>
    </StrictMode>
  )
}
