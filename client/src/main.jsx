import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SocketProvider } from './context/SocketProvider.jsx'
import { CallProvider } from './context/CallContext.jsx'

createRoot(document.getElementById('root')).render(
  // <StrictMode>
  <SocketProvider>
    <CallProvider>
      <App />
    </CallProvider>
  </SocketProvider>
  // </StrictMode>,
)