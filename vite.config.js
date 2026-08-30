import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function preloadShader() {
  return {
    name: 'preload-shader',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      const chunk = Object.values(ctx.bundle ?? {}).find(
        c => c.type === 'chunk' && /[\\/]src[\\/]components[\\/]SilkCanvas\.jsx$/.test(c.facadeModuleId ?? ''),
      )

      if (!chunk) {
        throw new Error(
          'preload-shader: no chunk with SilkCanvas.jsx as its entry. Either the ' +
            'lazy import in Silk.jsx is gone, or chunking changed and the shader is ' +
            'no longer its own chunk — in which case delete this plugin.',
        )
      }

      return {
        html,
        tags: [
          {
            tag: 'link',
            attrs: { rel: 'modulepreload', crossorigin: true, href: `/${chunk.fileName}` },
            injectTo: 'head',
          },
        ],
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preloadShader(),
  ],

  server: {
    proxy: {
      '/api/contact': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },

      '/api/admin': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: false,
      },
    },
  },

  build: {
    target: 'es2022',

    sourcemap: false,

    manifest: true,

    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'react',
              test: (id) => /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id),
              priority: 20,
            },

            {
              name: 'vendor',
              test: (id) =>
                /[\\/]node_modules[\\/]/.test(id) && !/[\\/]node_modules[\\/](lenis|ogl)[\\/]/.test(id),
              priority: 10,
            },

            {
              name: 'images',
              test: (id) =>
                /[\\/]src[\\/]components[\\/]ResponsiveImage\.jsx$/.test(id) ||
                /[\\/]src[\\/]content[\\/]imageManifest\.js$/.test(id),
              priority: 8,
            },

            {
              name: 'shell',
              test: (id) => /[\\/]src[\\/](components|lib)[\\/]/.test(id),
              minShareCount: 2,
              priority: 5,
            },

          ],
        },
      },
    },
  },
})
