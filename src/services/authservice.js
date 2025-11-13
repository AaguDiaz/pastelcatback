const crypto = require('crypto');
const supabase = require('../config/supabase');
const getSupabaseAdmin = require('../config/supabaseAdmin');
const { AppError, fromSupabaseError } = require('../utils/errors');
const { sendMail } = require('../utils/mailer');

const MIN_PASSWORD_LENGTH = 8;
const RESET_TOKEN_TTL_MINUTES = 15;

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

const createResetToken = async (userId, tipo, ttlMinutes) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('reset_clave')
    .insert({
      id_usuario: userId,
      token,
      tipo,
      expires_at: expiresAt,
      used: false,
    })
    .select('id_reset, token, expires_at')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo generar el token de restablecimiento.');
  }

  return data;
};

const findAuthUserByEmail = async (email) => {
  const normalizedEmail = sanitizeString(email).toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const supabaseAdmin = ensureAdminClient();
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw AppError.internal('No se pudo buscar el usuario autenticable por email.');
    }

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
};

const buildResetLink = (token) => {
  const baseUrl = sanitizeString(process.env.PASSWORD_RESET_URL || '');
  if (!baseUrl) {
    return null;
  }
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${token}`;
};

const buildResetEmail = (token) => {
  const resetLink = buildResetLink(token);
  const expiresText = `${RESET_TOKEN_TTL_MINUTES} minutos`;

  const htmlParts = [
    '<p>Recibimos un pedido para restablecer tu contraseña de PastelCat.</p>',
  ];

  if (resetLink) {
    htmlParts.push(
      `<p><a href="${resetLink}" style="display:inline-block;padding:12px 20px;background:#7c3aed;color:#fff;border-radius:6px;text-decoration:none;">Restablecer contraseña</a></p>`,
    );
  }

  htmlParts.push(
    `<p>Si el enlace no funciona, podés usar este token: <strong>${token}</strong>.</p>`,
    `<p>Este enlace vence en ${expiresText}. Si no hiciste la solicitud, ignorá este mensaje.</p>`,
  );

  const text = resetLink
    ? `Restablecé tu contraseña ingresando a: ${resetLink} (token: ${token}). El enlace vence en ${expiresText}.`
    : `Token para restablecer tu contraseña: ${token}. Vence en ${expiresText}.`;

  return { html: htmlParts.join(''), text };
};

const sendResetPasswordEmail = async (email, token) => {
  const { html, text } = buildResetEmail(token);
  await sendMail({
    to: email,
    subject: 'Restablecé tu contraseña',
    html,
    text,
  });
};

const markTokenAsUsed = async (idReset) => {
  const { error } = await supabase
    .from('reset_clave')
    .update({ used: true })
    .eq('id_reset', idReset);

  if (error) {
    throw fromSupabaseError(error, 'No se pudo invalidar el token utilizado.');
  }
};

const fetchActiveResetToken = async (token) => {
  const safeToken = sanitizeString(token);
  if (!safeToken) {
    throw AppError.badRequest('El token es obligatorio.');
  }

  const { data, error } = await supabase
    .from('reset_clave')
    .select('id_reset, id_usuario, expires_at, tipo')
    .eq('token', safeToken)
    .eq('used', false)
    .maybeSingle();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo validar el token.');
  }

  if (!data) {
    throw AppError.badRequest('El token no es válido o ya fue utilizado.');
  }

  if (data.tipo !== 'reset') {
    throw AppError.badRequest('El token proporcionado no es válido para restablecer la contraseña.');
  }

  if (!data.expires_at || new Date(data.expires_at).getTime() <= Date.now()) {
    throw AppError.badRequest('El token ya venció.');
  }

  return data;
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

  const user = await findAuthUserByEmail(safeEmail);

  if (!user) {
    return {
      message: 'Si el email existe en el sistema, recibirás un mensaje con instrucciones.',
    };
  }

  await markTokensUsedByType(user.id, 'reset');
  const { token } = await createResetToken(user.id, 'reset', RESET_TOKEN_TTL_MINUTES);
  await sendResetPasswordEmail(user.email || safeEmail, token);

  return {
    message: 'Si el email existe en el sistema, recibirás un mensaje con instrucciones.',
  };
};

const resetPasswordWithToken = async (token, newPassword) => {
  const validatedPassword = validateNewPassword(newPassword);
  const record = await fetchActiveResetToken(token);

  await updateUserPassword(record.id_usuario, validatedPassword);
  await markTokenAsUsed(record.id_reset);

  return { message: 'Contraseña actualizada correctamente.' };
};

module.exports = {
  login,
  changePasswordAfterFirstLogin,
  requestPasswordReset,
  resetPasswordWithToken,
};
