/**
 * APLYD - client configuration.
 * The AI key is NOT here: it lives only in the server environment (/api/extract).
 */
window.APLYD_CONFIG = {
  API_BASE: '',                 // same origin (Vercel or dev-server.js)
  MAX_IMAGE_EDGE: 2000,         // px, longest side sent to the model
  JPEG_QUALITY: 0.88,
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  BATCH_MAX_PHOTOS: 25,                 // per batch: keeps within free-tier limits and browser storage
  BATCH_CONCURRENCY: 2,                 // photos read at the same time
  BATCH_RETRY_WAITS_MS: [8000, 20000]   // automatic retries when the AI is busy or rate-limited
};
