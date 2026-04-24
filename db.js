const { createClient } = require('@supabase/supabase-js');

// Prefer SUPABASE_SERVICE_ROLE_KEY to bypass RLS since this is a backend script
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[TrustBot] ⚠️ Missing Supabase URL or Key. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
}

const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseKey || 'dummy_key');

module.exports = { supabase };
