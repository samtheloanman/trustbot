const { createClient } = require('@supabase/supabase-js');

// This is a privileged backend client. Do not fall back to the browser anon key:
// using it here makes server authorization depend on the public client policy
// and hides a missing production server credential.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail closed. Previously a missing configuration only logged a warning and
// then built a client pointed at 'https://example.supabase.co' with the key
// 'dummy_key'. The process came up looking healthy and every query failed at
// runtime instead -- on an auth path that means login and authorization checks
// fail in ways that are easy to misread as user error. Refuse to start.
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[TrustBot] Supabase configuration is required. Set NEXT_PUBLIC_SUPABASE_URL ' +
    '(or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Refusing to start.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
