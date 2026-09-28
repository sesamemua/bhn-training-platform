import { z } from "zod";

export interface SavedSocialText {
  id: string;
  body: string;
  status: string;
  editVersion: number;
  trackChanges: boolean;
}

export const SocialChangeDetail = z.object({
  before: z.string(),
  after: z.string(),
  version: z.number().int(),
});

export interface SocialTextChange {
  id: string;
  author: string;
  at: string;
  before: string;
  after: string;
  version: number;
}

export interface SocialEditResponse {
  ok?: boolean;
  error?: string;
  post?: SavedSocialText;
  change?: SocialTextChange;
}
