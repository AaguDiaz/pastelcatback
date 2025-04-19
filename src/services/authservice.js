const supabase = require('../config/supabase');

const login = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { user: data.user, session: data.session };
};

module.exports = { login };