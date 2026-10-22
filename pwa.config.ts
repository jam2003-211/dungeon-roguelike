import type { VitePWAOptions } from 'vite-plugin-pwa'

// 暫定名称・色・アイコンはここでまとめて管理する。
export const appIdentity = { name: 'ダンジョンローグライク', color: '#0a1832' } as const

export function normalizeBase(value = '/'): string {
  const path = value.replace(/^\/+|\/+$/g, '')
  if (path && !/^[\w./-]+$/.test(path)) throw new Error('VITE_BASE_PATHには /リポジトリ名/ の形式でパスを指定してください。')
  if (path.split('/').some((part) => part === '.' || part === '..')) throw new Error('VITE_BASE_PATHに相対パスは指定できません。')
  return path ? `/${path}/` : '/'
}

export function pwaOptions(base: string): Partial<VitePWAOptions> {
  return {
    base, scope: base,
    registerType: 'prompt', injectRegister: null,
    manifest: {
      id: base, name: appIdentity.name, short_name: appIdentity.name, lang: 'ja',
      start_url: base, scope: base, display: 'standalone', orientation: 'portrait',
      theme_color: appIdentity.color, background_color: appIdentity.color,
      icons: [
        { src: `${base}pwa/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}pwa/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${base}pwa/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // 画面にまだ出ていない画像も先に保存する。素材原本ZIPは対象に含めない。
      globPatterns: ['**/*.{html,js,css,png,svg,ico,woff,woff2,json,webmanifest}'],
      globIgnores: ['**/*.zip'], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      navigateFallback: `${base}index.html`,
      navigateFallbackAllowlist: [new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)],
      cleanupOutdatedCaches: true, skipWaiting: false, clientsClaim: false,
    },
    devOptions: { enabled: false },
  }
}
