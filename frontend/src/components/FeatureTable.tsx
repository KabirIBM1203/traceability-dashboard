import { useState } from "react";

import { getFeature } from "../services/api";

import type {
  Feature,
  FeatureDetails,
  RevTrac,
} from "../types/feature";


interface FeatureTableProps {
  features: Feature[];
}


export default function FeatureTable({
  features,
}: FeatureTableProps) {

  const [expandedFeature, setExpandedFeature] =
    useState<string | null>(null);

  const [detailsCache, setDetailsCache] =
    useState<Record<string, FeatureDetails>>({});

  const [loadingFeature, setLoadingFeature] =
    useState<string | null>(null);

  const [errorFeature, setErrorFeature] =
    useState<string | null>(null);


  async function handleFeatureClick(issueKey: string) {

    // Clicking the already-open feature collapses it
    if (expandedFeature === issueKey) {
      setExpandedFeature(null);
      return;
    }

    setExpandedFeature(issueKey);
    setErrorFeature(null);

    // Don't call backend again if we've already loaded it
    if (detailsCache[issueKey]) {
      return;
    }

    try {

      setLoadingFeature(issueKey);

      const details = await getFeature(issueKey);

      setDetailsCache((previous) => ({
        ...previous,
        [issueKey]: details,
      }));

    } catch (error) {

      console.error(
        `Failed to load ${issueKey}`,
        error
      );

      setErrorFeature(issueKey);

    } finally {

      setLoadingFeature(null);

    }
  }


  return (
    <div className="feature-table-wrapper">

      <table className="feature-table">

        <thead>
          <tr>
            <th className="expand-column"></th>
            <th>Issue Key</th>
            <th>Summary</th>
            <th>Status</th>
            <th>Stream</th>
            <th>Request Type</th>
            <th>RITM</th>
            <th>Release</th>
          </tr>
        </thead>


        <tbody>

          {features.map((feature) => {

            const isExpanded =
              expandedFeature === feature.issue_key;

            const details =
              detailsCache[feature.issue_key];

            return (
              <FeatureRows
                key={feature.issue_key}
                feature={feature}
                isExpanded={isExpanded}
                details={details}
                loading={
                  loadingFeature === feature.issue_key
                }
                hasError={
                  errorFeature === feature.issue_key
                }
                onClick={() =>
                  handleFeatureClick(
                    feature.issue_key
                  )
                }
              />
            );

          })}

        </tbody>

      </table>

    </div>
  );
}


/* =========================================================
   Feature rows
   ========================================================= */

interface FeatureRowsProps {
  feature: Feature;
  isExpanded: boolean;
  details?: FeatureDetails;
  loading: boolean;
  hasError: boolean;
  onClick: () => void;
}


function FeatureRows({
  feature,
  isExpanded,
  details,
  loading,
  hasError,
  onClick,
}: FeatureRowsProps) {

  return (
    <>
      <tr
        className={`feature-row ${
          isExpanded ? "expanded" : ""
        }`}
        onClick={onClick}
      >

        <td className="expand-column">

          <button
            className="expand-button"
            aria-label={
              isExpanded
                ? "Collapse feature"
                : "Expand feature"
            }
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            {isExpanded ? "▼" : "▶"}
          </button>

        </td>


        <td className="issue-key">
          {feature.issue_key}
        </td>


        <td className="summary-cell">
          {feature.summary || "—"}
        </td>


        <td>
          <span className="status-badge">
            {feature.status || "—"}
          </span>
        </td>


        <td>
          {feature.stream || "—"}
        </td>


        <td>
          {feature.request_type || "—"}
        </td>


        <td className="ritm-cell">
          {feature.ritm || "—"}
        </td>


        <td>
          {feature.fix_version || "—"}
        </td>

      </tr>


      {isExpanded && (

        <tr className="feature-detail-row">

          <td colSpan={8}>

            {loading && (

              <div className="inline-loading">
                Loading RevTrac and transport details...
              </div>

            )}


            {hasError && (

              <div className="inline-error">
                Unable to load details for{" "}
                <strong>{feature.issue_key}</strong>.
              </div>

            )}


            {!loading && !hasError && details && (

              <InlineFeatureDetails
                details={details}
              />

            )}

          </td>

        </tr>

      )}

    </>
  );
}


/* =========================================================
   Inline feature details
   ========================================================= */

interface InlineFeatureDetailsProps {
  details: FeatureDetails;
}


function InlineFeatureDetails({
  details,
}: InlineFeatureDetailsProps) {

  return (
    <div className="inline-details">

      <div className="inline-detail-grid">

        <div className="inline-detail-item">
          <span>RITM</span>
          <strong>
            {details.ritm || "—"}
          </strong>
        </div>


        <div className="inline-detail-item">
          <span>Status</span>
          <strong>
            {details.status || "—"}
          </strong>
        </div>


        <div className="inline-detail-item">
          <span>Stream</span>
          <strong>
            {details.stream || "—"}
          </strong>
        </div>


        <div className="inline-detail-item">
          <span>Request Type</span>
          <strong>
            {details.request_type || "—"}
          </strong>
        </div>


        <div className="inline-detail-item">
          <span>Release</span>
          <strong>
            {details.fix_version || "—"}
          </strong>
        </div>

      </div>


      <div className="revtrac-section-inline">

        <div className="section-heading-inline">

          <h3>
            RevTrac
          </h3>

          <span>
            {details.revtrac.length} request
            {details.revtrac.length !== 1
              ? "s"
              : ""}
          </span>

        </div>


        {details.revtrac.length === 0 ? (

          <div className="empty-state-inline">
            No RevTrac request is currently
            associated with this feature.
          </div>

        ) : (

          <div className="revtrac-list-inline">

            {details.revtrac.map((revtrac) => (

              <RevTracCard
                key={revtrac.revtrac}
                revtrac={revtrac}
              />

            ))}

          </div>

        )}

      </div>

    </div>
  );
}


/* =========================================================
   RevTrac card
   ========================================================= */

interface RevTracCardProps {
  revtrac: RevTrac;
}


function RevTracCard({
  revtrac,
}: RevTracCardProps) {

  const [expanded, setExpanded] =
    useState(false);


  return (
    <div className="revtrac-card-inline">

      <button
        className="revtrac-header-button"
        onClick={() =>
          setExpanded(!expanded)
        }
      >

        <div className="revtrac-header-left">

          <span className="revtrac-arrow">
            {expanded ? "▼" : "▶"}
          </span>

          <div>

            <span className="revtrac-label">
              REVTRAC
            </span>

            <strong>
              {revtrac.revtrac}
            </strong>

          </div>

        </div>


        <span className="revtrac-status">
          {revtrac.status || "—"}
        </span>

      </button>


      {expanded && (

        <div className="revtrac-content">

          <div className="revtrac-info-grid">

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


            <div>
              <span>Class</span>
              <strong>
                {revtrac.class || "—"}
              </strong>
            </div>

          </div>


          <div className="transport-section-inline">

            <div className="transport-heading-inline">

              <h4>
                Transports
              </h4>

              <span>
                {revtrac.transports.length}
              </span>

            </div>


            {revtrac.transports.length === 0 ? (

              <div className="no-transports-inline">
                No transports found.
              </div>

            ) : (

              <div className="transport-table-inline">

                <table>

                  <thead>

                    <tr>
                      <th>Sequence</th>
                      <th>Transport</th>
                      <th>Category</th>
                      <th>Short Text</th>
                      <th>Last Changed By</th>
                      <th>Release Date</th>
                      <th>Release Time</th>
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
                            {transport.last_changed_by || "—"}
                          </td>

                          <td>
                            {transport.release_date || "—"}
                          </td>

                          <td>
                            {transport.release_time || "—"}
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

      )}

    </div>
  );
}