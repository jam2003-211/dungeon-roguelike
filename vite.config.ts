import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { normalizeBase, pwaOptions } from './pwa.config'

export default defineConfig(({ mode }) => {
  const base = normalizeBase(loadEnv(mode, '.', '').VITE_BASE_PATH)
  return { base, plugins: [react(), VitePWA(pwaOptions(base))] }
})
