import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { collectRecoveryBundle } from "./save-recovery";

/** Retain original storage bytes, including saves this version cannot parse. */
function exportSaves() {
  const blob = new Blob([JSON.stringify(collectRecoveryBundle(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `there-and-back-again-recovery-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unrecoverable interface error", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="error-recovery" role="alert">
        <div>
          <p className="event-eyebrow">The table stumbled</p>
          <h1>Something went wrong on screen</h1>
          <p>
            Export the stored saves and deck lists before reloading. The backup
            preserves original data even when it cannot be read here. Changes
            that did not reach browser storage are not included.
          </p>
          <pre>{this.state.error.message}</pre>
          <div className="modal-actions">
            <button className="primary" onClick={() => location.reload()}>
              Reload the table
            </button>
            <button className="secondary" onClick={exportSaves}>
              Export saved games
            </button>
          </div>
        </div>
      </main>
    );
  }
}
