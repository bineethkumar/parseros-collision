// Public Supabase settings for the browser (the anon key is designed to be public;
// row-level security in supabase/schema.sql is what protects the data).
import { env, send } from "./_lib.js";

export default function handler(req, res) {
  try {
    send(res, 200, { supabaseUrl: env("SUPABASE_URL"), supabaseAnonKey: env("SUPABASE_ANON_KEY") });
  } catch (e) {
    send(res, 500, { error: "Supabase is not configured yet. See SETUP.md." });
  }
}
