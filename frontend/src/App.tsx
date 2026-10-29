import { useCallback, useEffect, useState } from "react";

import FeatureTable from "./components/FeatureTable";
import AiPanel from "./components/AiPanel";
import TrLookupPanel from "./components/TrLookupPanel";

import { getFeatures, getFeature, getDefects, getDefect } from "./services/api";

import type { Feature, FeatureDetails } from "./types/feature";


// ---------------------------------------------------------------------------
// View definitions
// ---------------------------------------------------------------------------

type ViewId = "dcrtb" | "gsit" | "lsit";

interface ViewConfig {
  id: ViewId;
  label: string;
  pill: string;
  heading: string;
  mode: "feature" | "defect";
  loadList: () => Promise<Feature[]>;
  loadDetail: (issueKey: string) => Promise<FeatureDetails>;
}

const VIEWS: ViewConfig[] = [
  {
    id: "dcrtb",
    label: "DCRTB",
    pill: "DCRTB Features",
    heading: "Features",
    mode: "feature",
    loadList: getFeatures,
    loadDetail: getFeature,
  },
  {
    id: "gsit",
    label: "GSIT",
    pill: "GSIT Defects (DBBT)",
    heading: "GSIT Defects",
    mode: "defect",
    loadList: () => getDefects("DBBT"),
    loadDetail: getDefect,
  },
  {
    id: "lsit",
    label: "LSIT",
    pill: "LSIT Defects (DMD0)",
    heading: "LSIT Defects",
    mode: "defect",
    loadList: () => getDefects("DMD0"),
    loadDetail: getDefect,
  },
];


// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {

  const [activeView, setActiveView] = useState<ViewId>("dcrtb");
  const [items, setItems]           = useState<Feature[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [trOpen, setTrOpen] = useState(false);

  const openAi  = useCallback(() => setAiOpen(true),  []);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const openTr  = useCallback(() => setTrOpen(true),  []);
  const closeTr = useCallback(() => setTrOpen(false), []);

  const view = VIEWS.find((v) => v.id === activeView)!;

  // Load data whenever the active view changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setItems([]);

        const data = await view.loadList();
        if (!cancelled) setItems(data);

      } catch (err) {
        console.error(err);
        if (!cancelled)
          setError(`Unable to load ${view.heading}. Make sure the backend is running.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps


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

        {/* Centre — view switcher dropdown */}
        <div className="header-center">
          <select
            className="view-select"
            value={activeView}
            onChange={(e) => setActiveView(e.target.value as ViewId)}
            aria-label="Switch dashboard view"
          >
            {VIEWS.map((v) => (
              <option key={v.id} value={v.id}>{v.pill}</option>
            ))}
          </select>
        </div>

        {/* Right — actions */}
        <div className="header-actions">
          <button
            className={`tr-lookup-button${trOpen ? " tr-lookup-button--active" : ""}`}
            onClick={openTr}
            aria-expanded={trOpen}
          >
            ⇄ TR Lookup
          </button>
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
            <h2>{view.heading}</h2>
            <span>{view.pill}</span>
          </div>
        </section>

        {loading && (
          <div className="message">
            Loading {view.heading}…
          </div>
        )}

        {error && (
          <div className="message error">
            {error}
          </div>
        )}

        {!loading && !error && (
          <FeatureTable
            key={activeView}
            features={items}
            getDetailFn={view.loadDetail}
            mode={view.mode}
          />
        )}

      </main>

      <AiPanel open={aiOpen} onClose={closeAi} />
      <TrLookupPanel open={trOpen} onClose={closeTr} />

    </div>

  );
}


export default App;
