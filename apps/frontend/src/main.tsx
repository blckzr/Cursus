import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapTheme } from './lib/theme'

// Apply the persisted dark/light theme to <html> BEFORE React renders so
// the first paint already has the right palette (no flash of light theme).
bootstrapTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
