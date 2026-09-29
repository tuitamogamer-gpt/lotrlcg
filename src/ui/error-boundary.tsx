import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

const SAVE_KEYS = [
  "there-and-back-again.save.v1",
  "there-and-back-again.campaign.v1",
];

/** Downloads the saved games so a display error never costs an adventure. */
function exportSaves() {
  const saves: Record<string, unknown> = {};
  for (const key of SAVE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) saves[key] = JSON.parse(raw);
    } catch {
      /* Skip unreadable entries. */
    }
  }
  const blob = new Blob([JSON.stringify(saves, null, 2)], {
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
            Your adventure is still saved on this device. Reload to return to
            the table. If the problem repeats, export the save and keep it.
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
