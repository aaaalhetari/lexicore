/**
 * LexiCore — مراحل التطبيق + أنواع مهام card_jobs (يجب أن تطابق CHECK في Postgres).
 * Import this module from Edge Functions so job_type strings stay single-sourced.
 */

/** Stage 1: Definition — اختيار التعريف الصحيح من متعدد */
export const STAGE_1_DEFINITION = 1

/** Stage 2: Fill in the blank — ملء الفراغ في الجملة */
export const STAGE_2_GAP_FILL = 2

/** Stage 3: Correct/incorrect — الحكم على صحة استخدام الكلمة */
export const STAGE_3_USAGE_JUDGMENT = 3

export const CARD_STAGES = [STAGE_1_DEFINITION, STAGE_2_GAP_FILL, STAGE_3_USAGE_JUDGMENT] as const
export type CardStage = (typeof CARD_STAGES)[number]

/** card_jobs.job_type + make-card-content JSON job_type */
export const JOB_ADD_MORE_WORDS = "add_more_words"
export const JOB_MAKE_CARD_CONTENT = "make_card_content"
export const JOB_ADD_CARD_SOUND = "add_card_sound"
/** Client invoke body: make_full_card (ليس مهمة في الطابور) */
export const JOB_MAKE_FULL_CARD = "make_full_card"
