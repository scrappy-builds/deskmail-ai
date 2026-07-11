import { Icon } from './Icon'
import { useToast } from './store/toastStore'

export function Toast(): JSX.Element | null {
  const { toast, dismiss } = useToast()
  if (!toast) return null
  return (
    <div
      className="absolute bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-lg px-5 py-2.5 text-[13px] font-bold shadow-raised"
      style={{ background: 'var(--text)', color: 'var(--bg)' }}
    >
      <Icon name="check" size={15} className="text-accent" />
      <span>{toast.text}</span>
      {toast.actionLabel && (
        <button
          onClick={() => {
            toast.onAction?.()
            dismiss()
          }}
          className="ml-1 rounded-md px-2 py-1 text-[12.5px] font-bold text-accent hover:underline"
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  )
}
