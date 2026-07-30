import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Catches render-time errors so one bad value cannot blank the entire app.
 *
 * Without this, any throw during render (a common one: putting an object where
 * React expects a string, e.g. a nested `address`) unmounts the whole tree and
 * leaves a white page with nothing in the UI to explain it.
 *
 * Errors are re-thrown to the console so the stack is still available in
 * devtools and in any error-reporting hook.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="max-w-lg mx-auto py-16 px-4">
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-base font-semibold text-neutral-900 mb-1">Something went wrong on this screen</h2>
          <p className="text-sm text-neutral-500 mb-4">
            The rest of the app is still working — you can go back and try again.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-left text-[11px] bg-neutral-50 border border-neutral-200 rounded-lg p-3 mb-4 overflow-auto max-h-40 text-red-700">
              {String(error?.message || error)}
            </pre>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-all"
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2.5 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }
}
