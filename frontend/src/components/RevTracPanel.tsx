import { useEffect, useState } from "react";

import {
  getRevtracStatus,
  uploadRevtrac,
  type RevtracDelta,
  type RevtracStatus,
  type UploadedFileInfo,
} from "../services/api";


interface Props {
  /** Called after a successful upload so open detail views are refreshed. */
  onUploaded: () => void;
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string } }; message?: string };
  return e?.response?.data?.detail ?? e?.message ?? "Upload failed.";
}

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}


function FileSlot({
  label,
  hint,
  info,
  file,
  onPick,
}: {
  label: string;
  hint: string;
  info: UploadedFileInfo | null;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  return (
    <div className="rt-slot">
      <div className="rt-slot-title">{label}</div>

      {info ? (
        <div className="rt-slot-current">
          <strong>{info.filename}</strong>
          <span>{info.rows.toLocaleString()} rows · uploaded {when(info.uploaded_at)}</span>
        </div>
      ) : (
        <div className="rt-slot-current rt-slot-empty">{hint}</div>
      )}

      <label className="rt-pick">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <span>{file ? file.name : info ? "Choose a newer file…" : "Choose file…"}</span>
      </label>
    </div>
  );
}


function DeltaView({ delta }: { delta: RevtracDelta }) {
  const s = delta.summary;

  if (delta.initial) {
    return (
      <div className="rt-delta">
        <div className="rt-delta-head">
          Initial load · {when(delta.applied_at)}
        </div>
        <p className="rt-delta-note">
          {s.reference_rows_total.toLocaleString()} reference rows and{" "}
          {s.transport_rows_total.toLocaleString()} transport rows loaded.
          Later uploads will show what changed against this baseline.
        </p>
      </div>
    );
  }

  const stats: [string, number][] = [
    ["New requests", s.requests_added],
    ["Removed requests", s.requests_removed],
    ["Status changes", s.status_changes],
    ["Transports added", s.transports_added],
    ["Transports removed", s.transports_removed],
    ["Tickets affected", s.affected_tickets],
  ];
  const nothing = stats.every(([, n]) => n === 0) &&
    s.reference_rows_added === 0 && s.reference_rows_removed === 0;

  return (
    <div className="rt-delta">
      <div className="rt-delta-head">
        Changes in last upload · {when(delta.applied_at)}
        <span className="rt-delta-updated"> ({delta.updated.join(" + ")})</span>
      </div>

      {nothing ? (
        <p className="rt-delta-note">No differences from the previously stored data.</p>
      ) : (
        <>
          <div className="rt-stats">
            {stats.map(([name, n]) => (
              <div key={name} className={`rt-stat${n ? " rt-stat--on" : ""}`}>
                <strong>{n.toLocaleString()}</strong>
                <span>{name}</span>
              </div>
            ))}
          </div>

          {delta.status_changes.length > 0 && (
            <details>
              <summary>Status changes ({s.status_changes})</summary>
              <ul>
                {delta.status_changes.map((c) => (
                  <li key={c.revtrac}>
                    <b>#{c.revtrac}</b> {c.title} — {c.from} → <b>{c.to}</b>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {delta.new_requests.length > 0 && (
            <details>
              <summary>New requests ({s.requests_added})</summary>
              <ul>
                {delta.new_requests.map((c) => (
                  <li key={c.revtrac}>
                    <b>#{c.revtrac}</b> {c.title} — {c.status}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {delta.removed_requests.length > 0 && (
            <details>
              <summary>Removed requests ({s.requests_removed})</summary>
              <ul>
                {delta.removed_requests.map((c) => (
                  <li key={c.revtrac}>
                    <b>#{c.revtrac}</b> {c.title} — {c.status}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {delta.transports_added.length > 0 && (
            <details>
              <summary>Transports added ({s.transports_added})</summary>
              <ul>
                {delta.transports_added.map((t) => (
                  <li key={`${t.revtrac}-${t.transport}`}>
                    <b>{t.transport}</b> (#{t.revtrac}) {t.short_text}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {delta.transports_removed.length > 0 && (
            <details>
              <summary>Transports removed ({s.transports_removed})</summary>
              <ul>
                {delta.transports_removed.map((t) => (
                  <li key={`${t.revtrac}-${t.transport}`}>
                    <b>{t.transport}</b> (#{t.revtrac}) {t.short_text}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {delta.affected_tickets.length > 0 && (
            <details>
              <summary>Tickets affected ({s.affected_tickets})</summary>
              <div className="rt-chips">
                {delta.affected_tickets.map((t) => (
                  <span key={t} className="rt-chip">{t}</span>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}


export default function RevTracPanel({ onUploaded }: Props) {

  const [status, setStatus]       = useState<RevtracStatus | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [transports, setTransports] = useState<File | null>(null);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [open, setOpen]           = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRevtracStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        if (!s.loaded) setOpen(true);   // nothing uploaded yet -> show the uploader
      })
      .catch(() => { /* 401 is handled globally */ });
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const s = await uploadRevtrac(reference, transports);
      setStatus(s);
      setReference(null);
      setTransports(null);
      onUploaded();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const canUpload = !busy && (reference !== null || transports !== null);
  const loaded = status?.loaded ?? false;

  return (
    <section className="rt-panel">

      <div className="rt-panel-head">
        <div>
          <h3>RevTrac data</h3>
          <span>
            {loaded
              ? "Showing the results of your last upload. Upload a new file to update."
              : "Upload the TR list and the RevTrac references to link transports to tickets."}
          </span>
        </div>
        <button className="rt-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Upload / changes"}
        </button>
      </div>

      {open && (
        <div className="rt-body">

          <div className="rt-slots">
            <FileSlot
              label="TR list"
              hint="No TR list uploaded yet"
              info={status?.transports ?? null}
              file={transports}
              onPick={setTransports}
            />
            <FileSlot
              label="RevTrac references"
              hint="No RevTrac references uploaded yet"
              info={status?.reference ?? null}
              file={reference}
              onPick={setReference}
            />
          </div>

          <div className="rt-actions">
            <button className="rt-upload" onClick={submit} disabled={!canUpload}>
              {busy ? "Processing…" : "Upload & update"}
            </button>
            <span className="rt-actions-note">
              You can upload one or both files. Nothing is changed if a file is invalid.
            </span>
          </div>

          {error && <div className="rt-error">{error}</div>}

          {status?.last_delta && <DeltaView delta={status.last_delta} />}

        </div>
      )}

    </section>
  );
}
