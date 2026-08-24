export interface Transport {
  sequence: number | string | null;
  transport_number: string | null;
  category: string | null;
  short_text: string | null;
  last_changed_by: string | null;
  release_date: string | null;
  release_time: string | null;
}

export interface RevTrac {
  revtrac: number;
  project: string | null;
  request_type: string | null;
  class: string | null;
  team: string | null;
  status: string | null;
  title: string | null;
  references: string | null;
  transports: Transport[];
}

export interface Feature {
  issue_key: string;
  ritm: string | null;
  status: string | null;
  summary: string | null;
  stream: string | null;
  request_type: string | null;
  fix_version: string | null;
}

// ---------------------------------------------------------------------------
// Release artifacts
// ---------------------------------------------------------------------------

export interface ReleaseArtifactChecklist {
  tr_bundle: boolean;
  uat_sign_off: boolean;
  fut_ut: boolean;
  release_notes: boolean;
}

export interface JiraAttachment {
  attachment_id: number | null;
  filename: string | null;
  label: string | null;
  media_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  author_id: string | null;
  created: string | null;
  content_url: string | null;
  thumbnail_url: string | null;
  /** Which required artifact types this file satisfies */
  artifact_types: string[];
}

export interface ReleaseArtifacts {
  checklist: ReleaseArtifactChecklist;
  attachments: JiraAttachment[];
}

export interface FeatureDetails extends Feature {
  revtrac: RevTrac[];
  release_artifacts: ReleaseArtifacts;
}