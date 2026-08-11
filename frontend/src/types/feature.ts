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

export interface FeatureDetails extends Feature {
  revtrac: RevTrac[];
}