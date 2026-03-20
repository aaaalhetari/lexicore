import {
  JOB_ADD_MORE_WORDS,
  JOB_MAKE_CARD_CONTENT,
  JOB_MAKE_FULL_CARD,
} from "../_shared/stages.ts"

export type MakeCardJobType =
  | typeof JOB_ADD_MORE_WORDS
  | typeof JOB_MAKE_CARD_CONTENT
  | typeof JOB_MAKE_FULL_CARD

/** POST body for make-card-content (queue + client invoke). */
export interface MakeCardContentRequest {
  user_id: string
  job_type: MakeCardJobType
  word_id?: number
  word?: string
  stage?: 1 | 2 | 3
  count?: number
}
