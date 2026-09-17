import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

import { getFeature } from "../services/api";

import type { Feature, FeatureDetails, RevTrac, Transport } from "../types/feature";


// ---------------------------------------------------------------------------
// Row types for each sheet
// ---------------------------------------------------------------------------

interface FeatureRow {
  "Issue Key":      string;
  "Summary":        string;
  "Status":         string;
  "Stream":         string;
  "Request Type":   string;
  "RITM":           string;
  "Fix Version":    string;
  // release artifacts
  "TR Bundle":        string;
  "UAT Sign-off":     string;
  "FUT / UT Doc":     string;
  "Release Notes":    string;
  // counts
  "RevTrac Count":    number;
  "Attachment Count": number;
}

interface RevTracRow {
  "Issue Key":     string;
  "RevTrac #":     number;
  "Title":         string;
  "Project":       string;
  "Request Type":  string;
  "Class":         string;
  "Team":          string;
  "Status":        string;
  "Transport Count": number;
}

interface TransportRow {
  "Issue Key":       string;
  "RevTrac #":       number;
  "Sequence":        string | number;
  "Transport Number": string;
  "Category":        string;
  "Short Text":      string;
  "Last Changed By": string;
  "Release Date":    string;
  "Release Time":    string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function str(v: string | number | null | undefined): string {
  return v != null ? String(v) : "";
}

function bool(v: boolean): string {
  return v ? "YES" : "NO";
}


// ---------------------------------------------------------------------------
// Build all three sheet data arrays from a list of FeatureDetails
// ---------------------------------------------------------------------------

function buildSheets(details: FeatureDetails[]): {
  features:   FeatureRow[];
  revtracs:   RevTracRow[];
  transports: TransportRow[];
} {
  const features:   FeatureRow[]   = [];
  const revtracs:   RevTracRow[]   = [];
  const transports: TransportRow[] = [];

  for (const d of details) {
    const cl = d.release_artifacts?.checklist;

    features.push({
      "Issue Key":      d.issue_key,
      "Summary":        str(d.summary),
      "Status":         str(d.status),
      "Stream":         str(d.stream),
      "Request Type":   str(d.request_type),
      "RITM":           str(d.ritm),
      "Fix Version":    str(d.fix_version),
      "TR Bundle":      cl ? bool(cl.tr_bundle)    : "—",
      "UAT Sign-off":   cl ? bool(cl.uat_sign_off) : "—",
      "FUT / UT Doc":   cl ? bool(cl.fut_ut)       : "—",
      "Release Notes":  cl ? bool(cl.release_notes): "—",
      "RevTrac Count":          d.revtrac?.length ?? 0,
      "Attachment Count":       d.release_artifacts?.attachments?.length ?? 0,
    });

    for (const rt of (d.revtrac ?? [])) {
      revtracs.push({
        "Issue Key":     d.issue_key,
        "RevTrac #":     rt.revtrac,
        "Title":         str(rt.title),
        "Project":       str(rt.project),
        "Request Type":  str(rt.request_type),
        "Class":         str(rt.class),
        "Team":          str(rt.team),
        "Status":        str(rt.status),
        "Transport Count": rt.transports?.length ?? 0,
      });

      for (const tr of (rt.transports ?? [])) {
        transports.push({
          "Issue Key":        d.issue_key,
          "RevTrac #":        rt.revtrac,
          "Sequence":         tr.sequence ?? "",
          "Transport Number": str(tr.transport_number),
          "Category":         str(tr.category),
          "Short Text":       str(tr.short_text),
          "Last Changed By":  str(tr.last_changed_by),
          "Release Date":     str(tr.release_date),
          "Release Time":     str(tr.release_time),
        });
      }
    }
  }

  return { features, revtracs, transports };
}


// ---------------------------------------------------------------------------
// Column widths helper — widen columns to fit content
// ---------------------------------------------------------------------------

function autoWidths<T extends Record<string, unknown>>(rows: T[]): XLSX.ColInfo[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((h) => {
    const maxData = Math.max(...rows.map((r) => String(r[h] ?? "").length));
    return { wch: Math.max(h.length, maxData) + 2 };
  });
}


// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExcelExport(
  filteredFeatures: Feature[],
  detailsCache: Record<string, FeatureDetails>
) {
  const [exporting, setExporting] = useState(false);

  const exportToExcel = useCallback(async () => {
    setExporting(true);

    try {
      // Fetch details for any feature not yet in cache
      const toFetch = filteredFeatures.filter(
        (f) => !detailsCache[f.issue_key]
      );

      const fetchedPairs: [string, FeatureDetails][] = await Promise.all(
        toFetch.map(async (f) => {
          const d = await getFeature(f.issue_key);
          return [f.issue_key, d] as [string, FeatureDetails];
        })
      );

      // Merge fetched into a local copy (don't mutate state from outside)
      const fullCache: Record<string, FeatureDetails> = {
        ...detailsCache,
        ...Object.fromEntries(fetchedPairs),
      };

      // Collect in filtered order
      const allDetails = filteredFeatures
        .map((f) => fullCache[f.issue_key])
        .filter((d): d is FeatureDetails => d != null);

      // Build sheet data
      const { features, revtracs, transports } = buildSheets(allDetails);

      // Build workbook
      const wb = XLSX.utils.book_new();

      const wsFeatures = XLSX.utils.json_to_sheet(features);
      wsFeatures["!cols"] = autoWidths(features);
      XLSX.utils.book_append_sheet(wb, wsFeatures, "Features");

      const wsRevTrac = XLSX.utils.json_to_sheet(revtracs);
      wsRevTrac["!cols"] = autoWidths(revtracs);
      XLSX.utils.book_append_sheet(wb, wsRevTrac, "RevTrac Requests");

      const wsTransports = XLSX.utils.json_to_sheet(transports);
      wsTransports["!cols"] = autoWidths(transports);
      XLSX.utils.book_append_sheet(wb, wsTransports, "Transports");

      // File name encodes filter context + timestamp
      const ts = new Date()
        .toISOString()
        .slice(0, 16)
        .replace("T", "_")
        .replace(/:/g, "-");

      const filename = `ReleaseCockpit_${ts}.xlsx`;

      // XLSX.writeFile relies on Node's `fs` which is absent in the browser.
      // Use XLSX.write() with type:"array" and trigger a download via a
      // temporary Blob URL — the standard browser-safe approach.
      const wbArray: Uint8Array = XLSX.write(wb, {
        bookType: "xlsx",
        type: "array",
      });

      const blob = new Blob([wbArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } finally {
      setExporting(false);
    }
  }, [filteredFeatures, detailsCache]);

  return { exportToExcel, exporting };
}
