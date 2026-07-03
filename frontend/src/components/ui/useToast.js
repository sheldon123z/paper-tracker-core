// Usage:
// // Wrap your app with <ToastContainer /> once at the root level (App.jsx).
// // Then in any component:
// import { useToast } from './components/ui'
// const { addToast } = useToast()
// addToast({ type: 'success', message: 'Paper saved!' })
// addToast({ type: 'error', message: 'Something went wrong', duration: 5000 })

import { create } from 'zustand'

let nextId = 0

const useToastStore = create((set) => ({
  toasts: [],
  addToast: ({ type = 'info', message, duration = 3000 }) => {
    const id = ++nextId
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, duration)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export default function useToast() {
  const addToast = useToastStore((s) => s.addToast)
  return { addToast }
}

export { useToastStore }
