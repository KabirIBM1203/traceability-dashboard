import { useMemo, useState, useCallback, memo } from "react";

import { getFeature } from "../services/api";
import { useExcelExport } from "../hooks/useExcelExport";

import type {
  Feature,
  FeatureDetails,
  RevTrac,
  ReleaseArtifacts,
  JiraAttachment,
} from "../types/feature";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

type SortKey = keyof Pick<
  Feature,
  "issue_key" | "summary" | "status" | "stream" | "request_type" | "ritm" | "fix_version"
>;
type SortDir = "asc" | "desc";


// ---------------------------------------------------------------------------
// FeatureTable (top-level)
// ---------------------------------------------------------------------------

interface FeatureTableProps {
  features: Feature[];
}


export default function FeatureTable({
  features,
}: FeatureTableProps) {

  // ---- expand / load state ------------------------------------------------
  const [expandedFeature, setExpandedFeature] =
    useState<string | null>(null);

  const [detailsCache, setDetailsCache] =
    useState<Record<string, FeatureDetails>>({});

  const [loadingFeature, setLoadingFeature] =
    useState<string | null>(null);

  const [errorFeature, setErrorFeature] =
    useState<string | null>(null);

  // ---- search / filter state ----------------------------------------------
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStream, setFilterStream] = useState("");
  const [filterFixVersion, setFilterFixVersion] = useState("");

  // ---- sort state ---------------------------------------------------------
  const [sortKey, setSortKey] = useState<SortKey>("issue_key");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ---- pagination state ---------------------------------------------------
  const [page, setPage] = useState(1);


  // ---- derive unique filter options ---------------------------------------
  const statusOptions = useMemo(
    () => uniqueSorted(features.map((f) => f.status)),
    [features]
  );
  const streamOptions = useMemo(
    () => uniqueSorted(features.map((f) => f.stream)),
    [features]
  );
  const fixVersionOptions = useMemo(
    () =>
      uniqueSorted(
        features.flatMap((f) =>
          f.fix_version
            ? f.fix_version.split(",").map((v) => v.trim())
            : []
        )
      ),
    [features]
  );


  // ---- filtered + sorted + paginated slice --------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return features.filter((f) => {
      if (filterStatus && f.status !== filterStatus) return false;
      if (filterStream && f.stream !== filterStream) return false;
      if (filterFixVersion) {
        const versions = f.fix_version
          ? f.fix_version.split(",").map((v) => v.trim())
          : [];
        if (!versions.includes(filterFixVersion)) return false;
      }

      if (q) {
        const haystack = [
          f.issue_key,
          f.summary,
          f.ritm,
          f.stream,
          f.status,
          f.fix_version,
          f.request_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [features, search, filterStatus, filterStream, filterFixVersion]);


  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] ?? "").toString().toLowerCase();
      const bv = (b[sortKey] ?? "").toString().toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);


  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, safePage]);


  // ---- handlers -----------------------------------------------------------
  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(1);
    },
    [sortKey]
  );

  const handleFilterChange = useCallback(() => {
    setPage(1);
  }, []);

  const handleFeatureClick = useCallback(
    async (issueKey: string) => {
      if (expandedFeature === issueKey) {
        setExpandedFeature(null);
        return;
      }

      setExpandedFeature(issueKey);
      setErrorFeature(null);

      if (detailsCache[issueKey]) return;

      try {
        setLoadingFeature(issueKey);
        const details = await getFeature(issueKey);
        setDetailsCache((prev) => ({ ...prev, [issueKey]: details }));
      } catch (err) {
        console.error(`Failed to load ${issueKey}`, err);
        setErrorFeature(issueKey);
      } finally {
        setLoadingFeature(null);
      }
    },
    [expandedFeature, detailsCache]
  );

  const hasActiveFilters =
    search !== "" ||
    filterStatus !== "" ||
    filterStream !== "" ||
    filterFixVersion !== "";

  // ---- excel export --------------------------------------------------------
  const { exportToExcel, exporting } = useExcelExport(sorted, detailsCache);


  // ---- render -------------------------------------------------------------
  return (
    <div>

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="toolbar">

        <div className="toolbar-left">

          <div className="search-wrapper">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search features, RITM, status…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                handleFilterChange();
              }}
            />
            {search && (
              <button
                className="search-clear"
                onClick={() => {
                  setSearch("");
                  handleFilterChange();
                }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <select
            className="filter-select"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              handleFilterChange();
            }}
          >
            <option value="">All Statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={filterStream}
            onChange={(e) => {
              setFilterStream(e.target.value);
              handleFilterChange();
            }}
          >
            <option value="">All Streams</option>
            {streamOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={filterFixVersion}
            onChange={(e) => {
              setFilterFixVersion(e.target.value);
              handleFilterChange();
            }}
          >
            <option value="">All Fix Versions</option>
            {fixVersionOptions.map((fixVersion) => (
              <option key={fixVersion} value={fixVersion}>{fixVersion}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              className="clear-filters-btn"
              onClick={() => {
                setSearch("");
                setFilterStatus("");
                setFilterStream("");
                setFilterFixVersion("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}

        </div>

        <div className="toolbar-right">
          <span className="result-count">
            {filtered.length === features.length
              ? `${features.length} features`
              : `${filtered.length} of ${features.length}`}
          </span>

          <button
            className="download-btn"
            onClick={exportToExcel}
            disabled={exporting || sorted.length === 0}
            title={
              hasActiveFilters
                ? `Download ${sorted.length} filtered feature${sorted.length !== 1 ? "s" : ""} as Excel`
                : `Download all ${sorted.length} features as Excel`
            }
          >
            {exporting ? (
              <>
                <span className="download-spinner" />
                Exporting…
              </>
            ) : (
              <>
                <span className="download-icon">↓</span>
                {hasActiveFilters
                  ? `Export ${sorted.length} filtered`
                  : "Export Excel"}
              </>
            )}
          </button>
        </div>

      </div>


      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="feature-table-wrapper">

        <table className="feature-table">

          <thead>
            <tr>
              <th className="expand-column"></th>
              <SortTh label="Issue Key"    col="issue_key"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Summary"      col="summary"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Status"       col="status"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Stream"       col="stream"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Request Type" col="request_type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="RITM"         col="ritm"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Fix Version"  col="fix_version"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>

          <tbody>
            {pageSlice.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  No features match your search or filters.
                </td>
              </tr>
            ) : (
              pageSlice.map((feature) => (
                <FeatureRows
                  key={feature.issue_key}
                  feature={feature}
                  isExpanded={expandedFeature === feature.issue_key}
                  details={detailsCache[feature.issue_key]}
                  loading={loadingFeature === feature.issue_key}
                  hasError={errorFeature === feature.issue_key}
                  onClick={() => handleFeatureClick(feature.issue_key)}
                />
              ))
            )}
          </tbody>

        </table>

      </div>


      {/* ── Pagination ─────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="pagination">

          <button
            className="page-btn"
            disabled={safePage === 1}
            onClick={() => setPage(1)}
            aria-label="First page"
          >
            «
          </button>

          <button
            className="page-btn"
            disabled={safePage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            ‹
          </button>

          {pageNumbers(safePage, totalPages).map((n) =>
            n === "…" ? (
              <span key={`ellipsis-${Math.random()}`} className="page-ellipsis">…</span>
            ) : (
              <button
                key={n}
                className={`page-btn${safePage === n ? " active" : ""}`}
                onClick={() => setPage(n as number)}
              >
                {n}
              </button>
            )
          )}

          <button
            className="page-btn"
            disabled={safePage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
          >
            ›
          </button>

          <button
            className="page-btn"
            disabled={safePage === totalPages}
            onClick={() => setPage(totalPages)}
            aria-label="Last page"
          >
            »
          </button>

          <span className="page-info">
            Page {safePage} of {totalPages}
          </span>

        </div>
      )}

    </div>
  );
}


// ---------------------------------------------------------------------------
// SortTh — sortable header cell
// ---------------------------------------------------------------------------

interface SortThProps {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
}

function SortTh({ label, col, sortKey, sortDir, onSort }: SortThProps) {
  const active = sortKey === col;
  return (
    <th
      className={`sortable-th${active ? " sort-active" : ""}`}
      onClick={() => onSort(col)}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="th-inner">
        {label}
        <span className="sort-indicator">
          {active ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"}
        </span>
      </span>
    </th>
  );
}


// ---------------------------------------------------------------------------
// FeatureRows
// ---------------------------------------------------------------------------

interface FeatureRowsProps {
  feature: Feature;
  isExpanded: boolean;
  details?: FeatureDetails;
  loading: boolean;
  hasError: boolean;
  onClick: () => void;
}

const FeatureRows = memo(function FeatureRows({
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
        className={`feature-row${isExpanded ? " expanded" : ""}`}
        onClick={onClick}
      >

        <td className="expand-column">
          <button
            className="expand-button"
            aria-label={isExpanded ? "Collapse feature" : "Expand feature"}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        </td>

        <td className="issue-key">{feature.issue_key}</td>

        <td className="summary-cell">{feature.summary || "—"}</td>

        <td>
          <span
            className="status-badge"
            data-status={feature.status?.toLowerCase() ?? undefined}
          >
            {feature.status || "—"}
          </span>
        </td>

        <td>{feature.stream || "—"}</td>

        <td>{feature.request_type || "—"}</td>

        <td className="ritm-cell">{feature.ritm || "—"}</td>

        <td>{feature.fix_version || "—"}</td>

      </tr>


      {isExpanded && (
        <tr className="feature-detail-row">
          <td colSpan={8}>

            {loading && (
              <div className="inline-loading">
                Loading RevTrac and transport details…
              </div>
            )}

            {hasError && (
              <div className="inline-error">
                Unable to load details for{" "}
                <strong>{feature.issue_key}</strong>.
              </div>
            )}

            {!loading && !hasError && details && (
              <InlineFeatureDetails details={details} />
            )}

          </td>
        </tr>
      )}

    </>
  );
});


// ---------------------------------------------------------------------------
// InlineFeatureDetails
// ---------------------------------------------------------------------------

interface InlineFeatureDetailsProps {
  details: FeatureDetails;
}

function InlineFeatureDetails({ details }: InlineFeatureDetailsProps) {
  return (
    <div className="inline-details">

      <div className="inline-detail-grid">

        <div className="inline-detail-item">
          <span>RITM</span>
          <strong>{details.ritm || "—"}</strong>
        </div>

        <div className="inline-detail-item">
          <span>Status</span>
          <strong>{details.status || "—"}</strong>
        </div>

        <div className="inline-detail-item">
          <span>Stream</span>
          <strong>{details.stream || "—"}</strong>
        </div>

        <div className="inline-detail-item">
          <span>Request Type</span>
          <strong>{details.request_type || "—"}</strong>
        </div>

        <div className="inline-detail-item">
          <span>Fix Version</span>
          <strong>{details.fix_version || "—"}</strong>
        </div>

      </div>


      {/* ── Release Artifacts ─────────────────────────────────────── */}
      <ReleaseArtifactsSection artifacts={details.release_artifacts} />


      <div className="revtrac-section-inline">

        <div className="section-heading-inline">
          <h3>RevTrac</h3>
          <span>
            {details.revtrac.length} request
            {details.revtrac.length !== 1 ? "s" : ""}
          </span>
        </div>

        {details.revtrac.length === 0 ? (
          <div className="empty-state-inline">
            No RevTrac request is currently associated with this feature.
          </div>
        ) : (
          <div className="revtrac-list-inline">
            {details.revtrac.map((revtrac) => (
              <RevTracCard key={revtrac.revtrac} revtrac={revtrac} />
            ))}
          </div>
        )}

      </div>

    </div>
  );
}


// ---------------------------------------------------------------------------
// ReleaseArtifactsSection
// ---------------------------------------------------------------------------

const ARTIFACT_LABELS: Record<string, string> = {
  tr_bundle:    "TR Bundle",
  uat_sign_off: "UAT Sign-off",
  fut_ut:       "FUT / UT Document",
  release_notes:"Release Notes",
};

interface ReleaseArtifactsSectionProps {
  artifacts: ReleaseArtifacts;
}

function ReleaseArtifactsSection({ artifacts }: ReleaseArtifactsSectionProps) {
  const [showFiles, setShowFiles] = useState(false);

  const { checklist, attachments } = artifacts;
  const allPresent = Object.values(checklist).every(Boolean);
  const presentCount = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="artifacts-section">

      <div className="section-heading-inline">
        <h3>Release Artifacts</h3>
        <span className={allPresent ? "artifacts-count-ok" : "artifacts-count-missing"}>
          {presentCount} / 4
        </span>
      </div>

      {/* Checklist */}
      <div className="artifacts-checklist">
        {(Object.keys(ARTIFACT_LABELS) as Array<keyof typeof checklist>).map((key) => {
          const present = checklist[key];
          return (
            <div
              key={key}
              className={`artifact-item ${present ? "artifact-present" : "artifact-missing"}`}
            >
              <span className="artifact-icon">{present ? "✓" : "✗"}</span>
              <span className="artifact-label">{ARTIFACT_LABELS[key]}</span>
            </div>
          );
        })}
      </div>

      {/* All attachments toggle */}
      {attachments.length > 0 && (
        <div className="artifacts-files">
          <button
            className="artifacts-toggle"
            onClick={() => setShowFiles((v) => !v)}
          >
            {showFiles ? "▼" : "▶"} {attachments.length} attachment
            {attachments.length !== 1 ? "s" : ""} on this issue
          </button>

          {showFiles && (
            <div className="artifacts-file-list">
              {attachments.map((att) => (
                <AttachmentRow key={att.attachment_id ?? att.filename} attachment={att} />
              ))}
            </div>
          )}
        </div>
      )}

      {attachments.length === 0 && (
        <p className="artifacts-none">No attachments found on this issue.</p>
      )}

    </div>
  );
}


// ---------------------------------------------------------------------------
// AttachmentRow
// ---------------------------------------------------------------------------

interface AttachmentRowProps {
  attachment: JiraAttachment;
}

function AttachmentRow({ attachment }: AttachmentRowProps) {
  const name = attachment.label || attachment.filename || "(unnamed)";
  const tags = attachment.artifact_types;

  return (
    <div className="attachment-row">

      <div className="attachment-info">
        {attachment.content_url ? (
          <a
            className="attachment-name"
            href={attachment.content_url}
            target="_blank"
            rel="noreferrer"
          >
            {name}
          </a>
        ) : (
          <span className="attachment-name">{name}</span>
        )}

        {attachment.mime_type && (
          <span className="attachment-mime">{attachment.mime_type}</span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="attachment-tags">
          {tags.map((t) => (
            <span key={t} className="attachment-tag">
              {ARTIFACT_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}

    </div>
  );
}


// ---------------------------------------------------------------------------
// RevTracCard
// ---------------------------------------------------------------------------

interface RevTracCardProps {
  revtrac: RevTrac;
}

function RevTracCard({ revtrac }: RevTracCardProps) {

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="revtrac-card-inline">

      <button
        className="revtrac-header-button"
        onClick={() => setExpanded((v) => !v)}
      >

        <div className="revtrac-header-left">
          <span className="revtrac-arrow">{expanded ? "▼" : "▶"}</span>
          <div>
            <span className="revtrac-label">REVTRAC</span>
            <strong>{revtrac.revtrac}</strong>
          </div>
        </div>

        <span className="revtrac-status">{revtrac.status || "—"}</span>

      </button>


      {expanded && (
        <div className="revtrac-content">

          <div className="revtrac-info-grid">

            <div>
              <span>Title</span>
              <strong>{revtrac.title || "—"}</strong>
            </div>

            <div>
              <span>Project</span>
              <strong>{revtrac.project || "—"}</strong>
            </div>

            <div>
              <span>Team</span>
              <strong>{revtrac.team || "—"}</strong>
            </div>

            <div>
              <span>Request Type</span>
              <strong>{revtrac.request_type || "—"}</strong>
            </div>

            <div>
              <span>Class</span>
              <strong>{revtrac.class || "—"}</strong>
            </div>

          </div>


          <div className="transport-section-inline">

            <div className="transport-heading-inline">
              <h4>Transports</h4>
              <span>{revtrac.transports.length}</span>
            </div>

            {revtrac.transports.length === 0 ? (
              <div className="no-transports-inline">No transports found.</div>
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
                    {revtrac.transports.map((transport, index) => (
                      <tr key={`${transport.transport_number}-${index}`}>
                        <td>{transport.sequence || "—"}</td>
                        <td className="transport-number">
                          {transport.transport_number || "—"}
                        </td>
                        <td>{transport.category || "—"}</td>
                        <td>{transport.short_text || "—"}</td>
                        <td>{transport.last_changed_by || "—"}</td>
                        <td>{transport.release_date || "—"}</td>
                        <td>{transport.release_time || "—"}</td>
                      </tr>
                    ))}
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


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v)))
  ).sort();
}

/**
 * Produces a compact page number list like: 1 … 4 5 6 … 12
 */
function pageNumbers(
  current: number,
  total: number
): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "…")[] = [];
  const addPage = (n: number) => pages.push(n);
  const addEllipsis = () => {
    if (pages[pages.length - 1] !== "…") pages.push("…");
  };

  addPage(1);

  if (current > 3) addEllipsis();

  for (let n = Math.max(2, current - 1); n <= Math.min(total - 1, current + 1); n++) {
    addPage(n);
  }

  if (current < total - 2) addEllipsis();

  addPage(total);

  return pages;
}
