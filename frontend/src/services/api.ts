import axios from "axios";

import type {
  Feature,
  FeatureDetails,
} from "../types/feature";


const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
});


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