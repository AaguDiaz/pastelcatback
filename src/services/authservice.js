const supabase = require('../config/supabase');
const getSupabaseAdmin = require('../config/supabaseAdmin');
const { AppError, fromSupabaseError } = require('../utils/errors');

const MIN_PASSWORD_LENGTH = 8;

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const ensureAdminClient = () => {
  try {
    return getSupabaseAdmin();
  } catch (err) {
    throw AppError.internal('No se pudo inicializar el cliente admin de Supabase. Verifica SUPABASE_SERVICE_ROLE_KEY.');
  }
};

const hasPendingSetPassword = async (userId) => {
  const { data, error } = await supabase
    .from('reset_clave')
    .select('id_reset')
    .eq('id_usuario', userId)
    .eq('tipo', 'set_password')
    .eq('used', false)
    .limit(1);

  if (error) {
    throw fromSupabaseError(error, 'No se pudo verificar el estado de la contraseña.');
  }

  return Array.isArray(data) && data.length > 0;
};

const markTokensUsedByType = async (userId, tipo) => {
  const { error } = await supabase
    .from('reset_clave')
    .update({ used: true })
    .eq('id_usuario', userId)
    .eq('tipo', tipo)
    .eq('used', false);

  if (error) {
    throw fromSupabaseError(error, 'No se pudo actualizar el estado del token.');
  }
};

const updateUserPassword = async (userId, newPassword) => {
  const supabaseAdmin = ensureAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    throw AppError.internal(error.message || 'No se pudo actualizar la contraseña.');
  }
};

const validateNewPassword = (password) => {
  if (typeof password !== 'string' || password.trim().length < MIN_PASSWORD_LENGTH) {
    throw AppError.badRequest(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return password.trim();
};

const login = async (email, password) => {
  const safeEmail = sanitizeString(email);
  const safePassword = typeof password === 'string' ? password : '';

  if (!safeEmail || !safePassword) {
    throw AppError.badRequest('Email y contraseña son obligatorios.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: safeEmail,
    password: safePassword,
  });

  if (error) {
    throw AppError.unauthorized(error.message || 'Credenciales inválidas.');
  }

  let requiresPasswordReset = false;
  const userId = data?.user?.id;

  if (userId) {
    requiresPasswordReset = await hasPendingSetPassword(userId);

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

const changePasswordAfterFirstLogin = async (userId, newPassword) => {
  if (!userId) {
    throw AppError.unauthorized('No se pudo identificar al usuario.');
  }

  const validatedPassword = validateNewPassword(newPassword);
  const pending = await hasPendingSetPassword(userId);

  if (!pending) {
    throw AppError.badRequest('No hay cambios de contraseña pendientes.');
  }

  await updateUserPassword(userId, validatedPassword);
  await markTokensUsedByType(userId, 'set_password');

  return { message: 'Contraseña actualizada correctamente.' };
};

const requestPasswordReset = async (email) => {
  const safeEmail = sanitizeString(email).toLowerCase();
  if (!safeEmail) {
    throw AppError.badRequest('El email es obligatorio.');
  }

  const redirectTo = sanitizeString(process.env.PASSWORD_RESET_URL || '');
  if (!redirectTo) {
    throw AppError.internal('Falta configurar PASSWORD_RESET_URL.');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, {
    redirectTo,
  });

  if (error) {
    throw AppError.badRequest(error.message || 'No se pudo iniciar el restablecimiento.');
  }

  return {
    message: 'Si el email existe en el sistema, recibirás un mensaje con instrucciones.',
  };
};

module.exports = {
  login,
  changePasswordAfterFirstLogin,
  requestPasswordReset,
};
