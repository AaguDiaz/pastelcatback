const supabase = require('../config/supabase');
const { AppError, fromSupabaseError } = require('../utils/errors');

const login = async (email, password) => {
  const safeEmail = typeof email === 'string' ? email.trim() : '';
  const safePassword = typeof password === 'string' ? password : '';

  if (!safeEmail || !safePassword) {
    throw AppError.badRequest('Email y contrasena son obligatorios.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: safeEmail,
    password: safePassword,
  });

  if (error) {
    throw AppError.unauthorized(error.message || 'Credenciales invalidas.');
  }

  let requiresPasswordReset = false;
  const userId = data?.user?.id;

  if (userId) {
    const nowIso = new Date().toISOString();
    const { data: tokens, error: resetError } = await supabase
      .from('reset_clave')
      .select('id_reset')
      .eq('id_usuario', userId)
      .eq('used', false)
      .gt('expires_at', nowIso)
      .in('tipo', ['set_password', 'reset']);

    if (resetError) {
      throw fromSupabaseError(resetError, 'No se pudo verificar el estado de la contrasena.');
    }

    requiresPasswordReset = Array.isArray(tokens) && tokens.length > 0;

    const { data: perfil, error: perfilError } = await supabase
      .from('perfil')
      .select('is_active')
      .eq('id', userId)
      .maybeSingle();

    if (perfilError) {
      throw fromSupabaseError(perfilError, 'No se pudo validar el estado del usuario.');
    }

    if (perfil && perfil.is_active === false) {
      throw AppError.forbidden('Tu usuario se encuentra dado de baja. Comunicate con un administrador.');
    }
  }

  return {
    user: data.user,
    session: data.session,
    requiresPasswordReset,
  };
};

module.exports = { login };
