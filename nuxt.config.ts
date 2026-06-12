import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Reader sits behind login (no SEO value) and offline mode needs a static PWA shell.
  ssr: false,

  modules: [
    '@nuxtjs/supabase',
    '@pinia/nuxt',
    '@element-plus/nuxt',
    '@vueuse/nuxt',
    '@vite-pwa/nuxt',
  ],

  // Flat component names (<BookCard>, <TocDrawer>) regardless of subdirectory.
  components: [{ path: '~/components', pathPrefix: false }],

  // Tailwind base must load before Element Plus component styles so EP wins on its own components.
  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  supabase: {
    // Pure SPA: keep the session in localStorage so the app can boot offline.
    useSsrCookies: false,
    redirectOptions: {
      login: '/login',
      callback: '/auth/callback',
      exclude: ['/login'],
    },
  },

  elementPlus: {
    themes: ['dark'],
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'LexiRead',
      short_name: 'LexiRead',
      description: 'Read books in any language with AI-assisted translation',
      theme_color: '#1f2937',
      background_color: '#111827',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
      // Book content lives in IndexedDB, not SW caches. Never cache RLS-scoped API data.
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/sign\/book-covers\/.*/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'book-covers',
            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        },
        {
          urlPattern: /^https:\/\/[^/]+\.supabase\.co\/(rest|auth|functions)\/.*/,
          handler: 'NetworkOnly',
        },
      ],
    },
    client: {
      installPrompt: true,
    },
  },
})
