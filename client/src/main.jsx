import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@/app/router.jsx'
import { AppProviders } from '@/app/providers.jsx'

createRoot(document.getElementById('root')).render(
  <AppProviders>
    <App />
  </AppProviders>
)
