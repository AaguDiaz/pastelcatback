const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;

const getSupabaseAdmin = () => {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Falta la variable de entorno SUPABASE_URL');
  }

  if (!serviceRoleKey) {
    throw new Error('Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEYy');
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
};

module.exports = getSupabaseAdmin;
