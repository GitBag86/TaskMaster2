import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://localhost:5000',
      '/tasks': 'http://localhost:5000',
      '/notifications': 'http://localhost:5000',
      '/admin': 'http://localhost:5000',
      '/team': 'http://localhost:5000',
      '/reports': 'http://localhost:5000',
      '/version': 'http://localhost:5000',
      '/projects': 'http://localhost:5000',
      '/users': 'http://localhost:5000',
      '/stats': 'http://localhost:5000',
      '/activity': 'http://localhost:5000',
      '/tags': 'http://localhost:5000',
      '/filters': 'http://localhost:5000',
      '/templates': 'http://localhost:5000',
      '/dependencies': 'http://localhost:5000',
      '/subtasks': 'http://localhost:5000',
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
