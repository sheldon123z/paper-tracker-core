export const DEV_API_PROXY = {
  '/api/copilotkit': {
    target: 'http://localhost:4100',
    changeOrigin: true,
  },
  '/api': {
    target: 'http://localhost:5002',
    changeOrigin: true,
  },
}
