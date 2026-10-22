import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/base.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Reactのマウント先が見つかりません。')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
