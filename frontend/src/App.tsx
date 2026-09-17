import { useCallback, useEffect, useState } from "react";

import FeatureTable from "./components/FeatureTable";
import AiPanel from "./components/AiPanel";

import { getFeatures } from "./services/api";

import type { Feature } from "./types/feature";


function App() {

  const [features, setFeatures] =
    useState<Feature[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [aiOpen, setAiOpen] = useState(false);

  const openAi  = useCallback(() => setAiOpen(true),  []);
  const closeAi = useCallback(() => setAiOpen(false), []);


  useEffect(() => {

    async function loadFeatures() {

      try {

        setLoading(true);
        setError(null);

        const data = await getFeatures();

        setFeatures(data);

      } catch (err) {

        console.error(err);

        setError(
          "Unable to load features. Make sure the backend is running."
        );

      } finally {

        setLoading(false);

      }
    }

    loadFeatures();

  }, []);


  return (

    <div className="app">

      {/* ── Navigation bar ───────────────────────────────────── */}
      <header className="header">

        {/* Left — brand */}
        <div className="header-brand">
          <div className="header-icon">
            <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1"  y="1"  width="5" height="5" rx="1.2" fill="white" fillOpacity="0.95"/>
              <rect x="1"  y="12" width="5" height="5" rx="1.2" fill="white" fillOpacity="0.95"/>
              <rect x="12" y="1"  width="5" height="5" rx="1.2" fill="white" fillOpacity="0.95"/>
              <rect x="12" y="12" width="5" height="5" rx="1.2" fill="white" fillOpacity="0.45"/>
              <line x1="6"   y1="3.5"  x2="12"  y2="3.5"  stroke="white" strokeOpacity="0.7" strokeWidth="1.2"/>
              <line x1="6"   y1="14.5" x2="12"  y2="14.5" stroke="white" strokeOpacity="0.7" strokeWidth="1.2"/>
              <line x1="3.5" y1="6"    x2="3.5"  y2="12"  stroke="white" strokeOpacity="0.7" strokeWidth="1.2"/>
              <line x1="14.5" y1="6"   x2="14.5" y2="12"  stroke="white" strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="1.8 1.4"/>
            </svg>
          </div>
          <div className="header-brand-text">
            <h1>Delivery Cockpit</h1>
            <p>powered by Traceability AI</p>
          </div>
        </div>

        {/* Centre — environment pill */}
        <div className="header-center">
          <span className="header-center-dot" />
          <span className="header-center-label">DCRTB Features</span>
        </div>

        {/* Right — actions */}
        <div className="header-actions">
          <button
            className={`ai-button${aiOpen ? " ai-button--active" : ""}`}
            onClick={openAi}
            aria-expanded={aiOpen}
            aria-controls="ai-panel"
          >
            ✦ Ask AI
          </button>
        </div>

      </header>


      {/* ── Main content ─────────────────────────────────────── */}
      <main className="content">

        <section className="dashboard-header">
          <div>
            <h2>Features</h2>
          </div>
        </section>


        {loading && (
          <div className="message">
            Loading features…
          </div>
        )}

        {error && (
          <div className="message error">
            {error}
          </div>
        )}

        {!loading && !error && (
          <FeatureTable features={features} />
        )}

      </main>

      <AiPanel open={aiOpen} onClose={closeAi} />

    </div>

  );
}


export default App;
