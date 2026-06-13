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
      '/auth': { target: 'http://localhost:5000' },
      '/tasks': { target: 'http://localhost:5000' },
      '/notifications': { target: 'http://localhost:5000' },
      '/admin': { target: 'http://localhost:5000' },
      '/team': { target: 'http://localhost:5000' },
      '/reports': { target: 'http://localhost:5000' },
      '/version': { target: 'http://localhost:5000' },
      '/projects': { target: 'http://localhost:5000' },
      '/users': { target: 'http://localhost:5000' },
      '/stats': { target: 'http://localhost:5000' },
      '/activity': { target: 'http://localhost:5000' },
      '/tags': { target: 'http://localhost:5000' },
      '/filters': { target: 'http://localhost:5000' },
      '/templates': { target: 'http://localhost:5000' },
      '/dependencies': { target: 'http://localhost:5000' },
      '/subtasks': { target: 'http://localhost:5000' },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
