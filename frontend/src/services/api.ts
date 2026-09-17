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