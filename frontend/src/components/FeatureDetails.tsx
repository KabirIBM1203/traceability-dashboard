import type { FeatureDetails as FeatureDetailsType } from "../types/feature";


interface FeatureDetailsProps {
  feature: FeatureDetailsType;
  onBack: () => void;
}


export default function FeatureDetails({
  feature,
  onBack,
}: FeatureDetailsProps) {

  return (
    <div className="feature-details">

      <button
        className="back-button"
        onClick={onBack}
      >
        ← Back to features
      </button>


      <div className="detail-header">

        <div>
          <div className="detail-issue-key">
            {feature.issue_key}
          </div>

          <h2>
            {feature.summary || "No summary"}
          </h2>
        </div>

      </div>


      <div className="detail-grid">

        <div className="detail-card">
          <span>RITM</span>
          <strong>
            {feature.ritm || "—"}
          </strong>
        </div>

        <div className="detail-card">
          <span>Status</span>
          <strong>
            {feature.status || "—"}
          </strong>
        </div>

        <div className="detail-card">
          <span>Stream</span>
          <strong>
            {feature.stream || "—"}
          </strong>
        </div>

        <div className="detail-card">
          <span>Request Type</span>
          <strong>
            {feature.request_type || "—"}
          </strong>
        </div>

        <div className="detail-card">
          <span>Fix Version</span>
          <strong>
            {feature.fix_version || "—"}
          </strong>
        </div>

      </div>


      <section className="revtrac-section">

        <div className="section-heading">
          <h3>RevTrac</h3>

          <span>
            {feature.revtrac.length} request
            {feature.revtrac.length !== 1 ? "s" : ""}
          </span>
        </div>


        {feature.revtrac.length === 0 ? (

          <div className="empty-state">
            No RevTrac request is currently associated
            with this feature.
          </div>

        ) : (

          <div className="revtrac-list">

            {feature.revtrac.map((revtrac) => (

              <div
                className="revtrac-card"
                key={revtrac.revtrac}
              >

                <div className="revtrac-header">

                  <div>
                    <span className="revtrac-label">
                      RevTrac
                    </span>

                    <h4>
                      {revtrac.revtrac}
                    </h4>
                  </div>

                  <span className="status">
                    {revtrac.status || "—"}
                  </span>

                </div>


                <div className="revtrac-info">

                  <div>
                    <span>Title</span>
                    <strong>
                      {revtrac.title || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Project</span>
                    <strong>
                      {revtrac.project || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Team</span>
                    <strong>
                      {revtrac.team || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Request Type</span>
                    <strong>
                      {revtrac.request_type || "—"}
                    </strong>
                  </div>

                </div>


                <div className="transport-section">

                  <div className="transport-heading">
                    <h5>Transports</h5>

                    <span>
                      {revtrac.transports.length}
                    </span>
                  </div>


                  {revtrac.transports.length === 0 ? (

                    <div className="no-transports">
                      No transports found.
                    </div>

                  ) : (

                    <div className="transport-table">

                      <table>

                        <thead>
                          <tr>
                            <th>Sequence</th>
                            <th>Transport</th>
                            <th>Category</th>
                            <th>Short Text</th>
                            <th>Release Date</th>
                          </tr>
                        </thead>

                        <tbody>

                          {revtrac.transports.map(
                            (transport, index) => (

                              <tr
                                key={`${transport.transport_number}-${index}`}
                              >

                                <td>
                                  {transport.sequence || "—"}
                                </td>

                                <td className="transport-number">
                                  {transport.transport_number || "—"}
                                </td>

                                <td>
                                  {transport.category || "—"}
                                </td>

                                <td>
                                  {transport.short_text || "—"}
                                </td>

                                <td>
                                  {transport.release_date || "—"}
                                </td>

                              </tr>

                            )
                          )}

                        </tbody>

                      </table>

                    </div>

                  )}

                </div>

              </div>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}