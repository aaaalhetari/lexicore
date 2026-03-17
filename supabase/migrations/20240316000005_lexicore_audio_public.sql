-- LexiCore: Make lexicore-audio bucket public so audio URLs work
-- Required for TTS playback in the app

update storage.buckets
set public = true
where id = 'lexicore-audio';
