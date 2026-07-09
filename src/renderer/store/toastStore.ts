import { create } from 'zustand'

interface Toast {
  text: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastState {
  toast: Toast | null
  show: (toast: Toast, ms?: number) => void
  dismiss: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null

export const useToast = create<ToastState>((set) => ({
  toast: null,
  show: (toast, ms = 5000) => {
    if (timer) clearTimeout(timer)
    set({ toast })
    timer = setTimeout(() => set({ toast: null }), ms)
  },
  dismiss: () => {
    if (timer) clearTimeout(timer)
    set({ toast: null })
  }
}))
