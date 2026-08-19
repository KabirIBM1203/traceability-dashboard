import { useEffect, useState } from "react";

import FeatureTable from "./components/FeatureTable";

import { getFeatures } from "./services/api";

import type { Feature } from "./types/feature";


function App() {

  const [features, setFeatures] =
    useState<Feature[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);


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
          "Unable to load features."
        );

      } finally {

        setLoading(false);

      }
    }

    loadFeatures();

  }, []);


  return (

    <div className="app">

      <header className="header">

        <div>

          <h1>
            Traceability Dashboard
          </h1>

          <p>
            JIRA feature traceability and release overview
          </p>

        </div>


        <button className="ai-button">
          ✨ Ask AI
        </button>

      </header>


      <main className="content">

        <section className="dashboard-header">

          <div>

            <h2>
              Features
            </h2>

          </div>

        </section>


        {loading && (

          <div className="message">
            Loading features...
          </div>

        )}


        {error && (

          <div className="message error">
            {error}
          </div>

        )}


        {!loading && !error && (

          <FeatureTable
            features={features}
          />

        )}

      </main>

    </div>

  );
}


export default App;