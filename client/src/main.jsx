import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SocketProvider } from './context/SocketProvider.jsx'
import { CallProvider } from './context/CallContext.jsx'
import { CallHistoryProvider } from "./context/CallHistoryProvider.jsx";

createRoot(document.getElementById('root')).render(
  <SocketProvider>
    <CallProvider>
      <CallHistoryProvider>
        <App />
      </CallHistoryProvider>
    </CallProvider>
  </SocketProvider>
)