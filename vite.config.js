import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import preact from '@preact/preset-vite';
import { readFileSync, writeFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const buildHash = `${pkg.version}-${Date.now().toString(36)}`;

export default defineConfig({
  define: {
    // Injected at build time so the version gate can detect new deploys
    __APP_BUILD_HASH__: JSON.stringify(buildHash),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'The Taste - Chinese Food Patna',
        short_name: 'The Taste',
        description: 'Delicious, Fresh & Reasonable Chinese Food & Fast Food on Sandalpur Road, Kumhrar, Patna',
        theme_color: '#FF6B35',
        background_color: '#0F0F1A',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        categories: ['food', 'business'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Order Online',
            short_name: 'Order',
            url: '/#/self-order',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Staff POS',
            short_name: 'POS',
            url: '/#/pos',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
      }
    }),
    {
      name: 'generate-version-json',
      writeBundle() {
        try {
          writeFileSync('dist/version.json', JSON.stringify({ version: buildHash }));
          console.log(`[VersionPlugin] Generated version.json with build hash: ${buildHash}`);
        } catch (err) {
          console.error('[VersionPlugin] Failed to write version.json:', err);
        }
      }
    }
  ],
  server: {
    port: 3000
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) return 'supabase';
        }
      }
    }
  }
});
