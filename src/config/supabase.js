const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;