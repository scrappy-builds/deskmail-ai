import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

// Last line of defence: if a render throws, show a friendly panel instead of a
// blank window, with a way to reload.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('DeskMail render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg p-8 text-text">
        <div className="max-w-[440px] text-center">
          <div className="text-[18px] font-bold">Something went wrong on this screen</div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-text-2">
            That's on me, not you. Your mail and settings are safe on this PC — nothing was lost.
            Reloading usually clears it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2"
          >
            Reload DeskMail
          </button>
        </div>
      </div>
    )
  }
}
