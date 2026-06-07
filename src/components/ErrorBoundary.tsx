'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export function ErrorBoundary({ children, fallback }: Props) {
  return (
    <ErrorBoundaryInner fallback={fallback}>
      {children}
    </ErrorBoundaryInner>
  );
}

class ErrorBoundaryInner extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 rounded-xl border border-red-800/50 bg-red-950/30">
          <div className="text-red-400 text-lg font-semibold mb-2">
            Something went wrong
          </div>
          <div className="text-red-300/70 text-sm mb-4 max-w-md text-center">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-lg bg-red-800/50 hover:bg-red-700/50 text-red-200 text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
