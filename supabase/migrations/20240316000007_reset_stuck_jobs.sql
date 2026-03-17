-- LexiCore: Reset stuck "processing" jobs so they can be retried
-- Run once to unblock the queue

update public.refill_jobs set status = 'pending' where status = 'processing';
