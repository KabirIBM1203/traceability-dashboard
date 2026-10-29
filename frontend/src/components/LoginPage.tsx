import { useEffect, useState } from "react";

import { getAuthStatus, loginToDatabricks } from "../services/api";


interface Props {
  onLoggedIn: () => void;
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string } }; message?: string };
  if (e?.response?.data?.detail) return e.response.data.detail;
  if (e?.message === "Network Error")
    return "Cannot reach the backend. Start it with: uvicorn app.main:app --reload";
  return e?.message ?? "Sign-in failed.";
}


export default function LoginPage({ onLoggedIn }: Props) {

  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    getAuthStatus()
      .then((s) => {
        setConfigured(s.configured);
        if (s.connected) onLoggedIn();
      })
      .catch(() => { /* backend down - the sign-in attempt will say so */ });
  }, [onLoggedIn]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await loginToDatabricks();
      onLoggedIn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="header-icon login-icon">
          <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1"  y="1"  width="5" height="5" rx="1.2" fill="white" fillOpacity="0.95"/>
            <rect x="1"  y="12" width="5" height="5" rx="1.2" fill="white" fillOpacity="0.95"/>
            <rect x="12" y="1"  width="5" height="5" rx="1.2" fill="white" fillOpacity="0.95"/>
            <rect x="12" y="12" width="5" height="5" rx="1.2" fill="white" fillOpacity="0.45"/>
          </svg>
        </div>

        <h1>Delivery Cockpit</h1>
        <p className="login-sub">powered by Traceability AI</p>

        <button
          className="login-button"
          onClick={signIn}
          disabled={busy || !configured}
        >
          {busy ? "Waiting for sign-in…" : "Sign in with Databricks"}
        </button>

        {busy && (
          <p className="login-hint">
            A Microsoft sign-in window has opened in your browser. Complete it
            there and this page continues automatically.
          </p>
        )}

        {!configured && (
          <div className="login-error">
            Databricks is not configured. Set DATABRICKS_SERVER_HOSTNAME and
            DATABRICKS_HTTP_PATH in backend/.env, then restart the backend.
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

      </div>
    </div>
  );
}
