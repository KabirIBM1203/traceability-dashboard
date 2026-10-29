import axios from "axios";

import type {
  Feature,
  FeatureDetails,
} from "../types/feature";


const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
});

// Any 401 means the Databricks session is gone -> App falls back to the login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      window.dispatchEvent(new Event("auth-required"));
    }
    return Promise.reject(error);
  }
);


// ---------------------------------------------------------------------------
// Auth (Databricks login gate)
// ---------------------------------------------------------------------------

export interface AuthStatus {
  connected: boolean;
  configured: boolean;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await api.get<AuthStatus>("/api/auth/status");
  return response.data;
}

// Blocks until the user finishes the Microsoft Entra ID browser sign-in
export async function loginToDatabricks(): Promise<void> {
  await api.post("/api/auth/login");
}


// ---------------------------------------------------------------------------
// RevTrac uploads (TR list + RevTrac references)
// ---------------------------------------------------------------------------

export interface UploadedFileInfo {
  filename: string;
  uploaded_at: string;
  rows: number;
}

export interface RevtracDelta {
  applied_at: string;
  updated: string[];
  initial: boolean;
  summary: {
    requests_added: number;
    requests_removed: number;
    status_changes: number;
    reference_rows_added: number;
    reference_rows_removed: number;
    transports_added: number;
    transports_removed: number;
    affected_tickets: number;
    reference_rows_total: number;
    transport_rows_total: number;
  };
  new_requests: { revtrac: number; title: string; status: string }[];
  removed_requests: { revtrac: number; title: string; status: string }[];
  status_changes: { revtrac: number; title: string; from: string; to: string }[];
  transports_added: { revtrac: number; transport: string; short_text: string }[];
  transports_removed: { revtrac: number; transport: string; short_text: string }[];
  affected_tickets: string[];
}

export interface RevtracStatus {
  loaded: boolean;
  reference: UploadedFileInfo | null;
  transports: UploadedFileInfo | null;
  last_delta: RevtracDelta | null;
}

export async function getRevtracStatus(): Promise<RevtracStatus> {
  const response = await api.get<RevtracStatus>("/api/revtrac/status");
  return response.data;
}

export async function uploadRevtrac(
  reference: File | null,
  transports: File | null
): Promise<RevtracStatus> {
  const form = new FormData();
  if (reference) form.append("reference", reference);
  if (transports) form.append("transports", transports);
  const response = await api.post<RevtracStatus>("/api/revtrac/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}


export async function getFeatures(): Promise<Feature[]> {
  const response = await api.get<Feature[]>(
    "/api/features"
  );

  return response.data;
}


export async function getFeature(
  issueKey: string
): Promise<FeatureDetails> {
  const response = await api.get<FeatureDetails>(
    `/api/features/${issueKey}`
  );

  return response.data;
}


// project: "DBBT" (GSIT) | "DMD0" (LSIT)
export async function getDefects(project: string): Promise<Feature[]> {
  const response = await api.get<Feature[]>("/api/defects", {
    params: { project },
  });
  return response.data;
}


export async function getDefect(
  issueKey: string
): Promise<FeatureDetails> {
  const response = await api.get<FeatureDetails>(
    `/api/defects/${issueKey}`
  );
  return response.data;
}


// ---------------------------------------------------------------------------
// Genie AI
// ---------------------------------------------------------------------------

export interface GenieResponse {
  conversation_id: string | null;
  message_id: string | null;
  answer: string;
}

export async function askGenie(question: string): Promise<GenieResponse> {
  const response = await api.post<GenieResponse>("/api/genie/ask", {
    question,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// TR Lookup
// ---------------------------------------------------------------------------

export interface TrLookupRow {
  tr: string;
  owner: string | null;
  short_description: string | null;
  workstream: string | null;
  ticket: string | null;           // e.g. "RITM: RITM4740979"
  ticket_source: string | null;    // which stage resolved it
  feature_status: string | null;
  opco: string | null;
}

export async function uploadTrLookup(file: File): Promise<TrLookupRow[]> {
  const form = new FormData();
  form.append("file", file);
  const response = await api.post<TrLookupRow[]>("/api/tr-lookup", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}


export async function genieFollowup(
  conversationId: string,
  question: string
): Promise<GenieResponse> {
  const response = await api.post<GenieResponse>("/api/genie/followup", {
    conversation_id: conversationId,
    question,
  });
  return response.data;
}