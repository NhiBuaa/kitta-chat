import { StrictMode } from 'react'
import { SocketProvider } from '@/services/socket/SocketProvider.jsx'
import { CallProvider } from '@/features/calls/context/CallContext.jsx'
import { CallHistoryProvider } from '@/features/calls/context/CallHistoryProvider.jsx'

export const AppProviders = ({ children }) => {
  return (
    <StrictMode>
      <SocketProvider>
        <CallProvider>
          <CallHistoryProvider>{children}</CallHistoryProvider>
        </CallProvider>
      </SocketProvider>
    </StrictMode>
  )
}
