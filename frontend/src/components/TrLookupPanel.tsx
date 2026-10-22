import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { uploadTrLookup } from "../services/api";
import type { TrLookupRow } from "../services/api";


// ---------------------------------------------------------------------------
// Source badge labels
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  transport_short_text:    "TR Short Text",
  revtrac_ref_value:       "RevTrac Ref",
  databricks_ref_value:    "Databricks Ref",
  databricks_parent_feature: "Parent Feature",
  excel_short_description: "Excel Desc",
};

// ---------------------------------------------------------------------------
// TrLookupPanel
// ---------------------------------------------------------------------------

interface TrLookupPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function TrLookupPanel({ open, onClose }: TrLookupPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]       = useState<TrLookupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [search, setSearch]   = useState("");
  const [filterTicket, setFilterTicket] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setRows([]);
    setSearch("");
    setFilterTicket("");
    processFile(file);
  }

  async function processFile(file: File) {
    setLoading(true);
    try {
      const data = await uploadTrLookup(file);
      setRows(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to process file.";
      setError(msg);
    } finally {
      setLoading(false);
      // Reset input so the same file can be re-uploaded
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setFileName(file.name);
      setError(null);
      setRows([]);
      processFile(file);
    }
  }

  // ---- filter ---------------------------------------------------------------
  const ticketOptions = Array.from(
    new Set(rows.map((r) => r.ticket?.split(":")[0]?.trim()).filter(Boolean))
  ).sort() as string[];

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      r.tr.toLowerCase().includes(q) ||
      (r.owner ?? "").toLowerCase().includes(q) ||
      (r.short_description ?? "").toLowerCase().includes(q) ||
      (r.ticket ?? "").toLowerCase().includes(q) ||
      (r.opco ?? "").toLowerCase().includes(q);

    const matchesTicket =
      !filterTicket ||
      (r.ticket ?? "").startsWith(filterTicket + ":");

    return matchesSearch && matchesTicket;
  });

  function handleDownload() {
    const data = filtered.map((r) => ({
      "TR":                r.tr,
      "Owner":             r.owner ?? "",
      "Short Description": r.short_description ?? "",
      "Workstream":        r.workstream ?? "",
      "Ticket":            r.ticket ?? "",
      "Status":            r.feature_status ?? "",
      "OpCo":              r.opco ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map((key) => ({
      wch: Math.min(
        60,
        Math.max(
          key.length,
          ...data.map((d) => String(d[key as keyof typeof d]).length)
        ) + 2
      ),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TR Lookup");

    const wbArray = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbArray as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const ts = new Date().toISOString().slice(0, 16).replace("T", "_").replace(/:/g, "-");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TR_Lookup_${ts}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const resolved   = rows.filter((r) => r.ticket).length;
  const unresolved = rows.length - resolved;

  if (!open) return null;

  return (
    <div className="tr-panel-overlay" onClick={onClose}>
      <div
        className="tr-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="TR Lookup"
      >

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="tr-panel-header">
          <div>
            <h2>TR Lookup</h2>
            <p>Upload an Excel file with a <code>Request/Task</code> column to resolve TRs → tickets</p>
          </div>
          <button className="tr-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Drop zone ───────────────────────────────────────── */}
        <div
          className={`tr-drop-zone${loading ? " tr-drop-zone--loading" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !loading && fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {loading ? (
            <span className="tr-drop-label">Processing…</span>
          ) : (
            <>
              <span className="tr-drop-icon">📂</span>
              <span className="tr-drop-label">
                {fileName
                  ? `Re-upload or drop a new file (loaded: ${fileName})`
                  : "Click or drag & drop an Excel file here"}
              </span>
            </>
          )}
        </div>

        {error && (
          <div className="tr-error">{error}</div>
        )}

        {/* ── Stats bar ───────────────────────────────────────── */}
        {rows.length > 0 && (
          <div className="tr-stats">
            <span className="tr-stat"><strong>{rows.length}</strong> TRs</span>
            <span className="tr-stat tr-stat--ok"><strong>{resolved}</strong> resolved</span>
            {unresolved > 0 && (
              <span className="tr-stat tr-stat--miss"><strong>{unresolved}</strong> unresolved</span>
            )}
          </div>
        )}

        {/* ── Filters ─────────────────────────────────────────── */}
        {rows.length > 0 && (
          <div className="tr-filters">
            <input
              className="tr-search"
              type="text"
              placeholder="Search TR, owner, ticket, OpCo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="tr-filter-select"
              value={filterTicket}
              onChange={(e) => setFilterTicket(e.target.value)}
            >
              <option value="">All ticket types</option>
              {ticketOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              className="tr-download-btn"
              onClick={handleDownload}
              disabled={filtered.length === 0}
            >
              ⬇ Download Excel
            </button>
          </div>
        )}

        {/* ── Results table ───────────────────────────────────── */}
        {filtered.length > 0 && (
          <div className="tr-table-wrap">
            <table className="tr-table">
              <thead>
                <tr>
                  <th>TR</th>
                  <th>Owner</th>
                  <th>Short Description</th>
                  <th>Workstream</th>
                  <th>Ticket</th>
                  <th>Status</th>
                  <th>OpCo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={`${row.tr}-${i}`} className={row.ticket ? "" : "tr-row--unresolved"}>
                    <td className="tr-cell-tr">{row.tr}</td>
                    <td>{row.owner ?? "—"}</td>
                    <td className="tr-cell-desc">{row.short_description ?? "—"}</td>
                    <td>{row.workstream ?? "—"}</td>
                    <td>
                      {row.ticket ? (
                        <span className="tr-ticket">
                          {row.ticket}
                          {row.ticket_source && (
                            <span className="tr-ticket-source">
                              {SOURCE_LABELS[row.ticket_source] ?? row.ticket_source}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="tr-unresolved">—</span>
                      )}
                    </td>
                    <td>
                      {row.feature_status ? (
                        <span className="tr-status-badge">{row.feature_status}</span>
                      ) : "—"}
                    </td>
                    <td>{row.opco ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && filtered.length === 0 && (
          <div className="tr-empty">No rows match the current filter.</div>
        )}

      </div>
    </div>
  );
}
