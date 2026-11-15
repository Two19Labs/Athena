/**
 * APLYD - Configuration Layer
 * Central configuration for Supabase, Storage, and AI Vision Endpoints.
 * 
 * In Cloud Mode: Connects directly to Supabase PostgreSQL, Storage, and Edge Functions.
 * In Autonomous Local Mode (when keys are unset): Uses the persistent local data engine
 * allowing all features (upload, pan/zoom, audit log, approvals, export, analytics)
 * to run flawlessly with zero setup.
 */

const APLYD_CONFIG = {
  // Supabase Project Credentials (Paste your project credentials here when ready)
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Private Storage Bucket for Form Photographs
  STORAGE_BUCKET: "production-forms",

  // Edge Function Endpoints
  PARSE_FORM_FUNCTION: "parse-production-form",
  SUBMIT_ERP_FUNCTION: "submit-production-record",

  // Demo Environment Defaults
  DEMO_MODE: true,
  APP_VERSION: "1.0.0",

  /**
   * Detects whether valid Supabase Cloud credentials are provided.
   */
  isCloudMode() {
    return Boolean(
      this.SUPABASE_URL && 
      this.SUPABASE_ANON_KEY && 
      this.SUPABASE_URL.startsWith("https://") &&
      this.SUPABASE_ANON_KEY.length > 20
    );
  }
};

window.APLYD_CONFIG = APLYD_CONFIG;
