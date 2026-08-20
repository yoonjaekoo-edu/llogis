import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import StockMarketNav from './StockMarketNav'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider context={{}}>
      <App />
      <StockMarketNav />
    </HelmetProvider>
  </React.StrictMode>,
)
