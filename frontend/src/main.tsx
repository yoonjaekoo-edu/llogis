import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import DogeMarketNav from './DogeMarketNav'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider context={{}}>
      <App />
      <DogeMarketNav />
    </HelmetProvider>
  </React.StrictMode>,
)
