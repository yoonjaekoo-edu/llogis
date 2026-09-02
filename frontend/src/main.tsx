import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { installDiceBearAvatarDefaults } from './dicebearAvatar'

installDiceBearAvatarDefaults()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider context={{}}>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)
