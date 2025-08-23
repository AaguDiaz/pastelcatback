class AppError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;     // código lógico público (ej: 'FOREIGN_KEY_CONFLICT')
    this.status = status; // HTTP status
    this.details = details; // info técnica opcional
  }

  static badRequest(msg = 'Solicitud inválida', details) {
    return new AppError('BAD_REQUEST', msg, 400, details);
  }
  static notFound(msg = 'Recurso no encontrado', details) {
    return new AppError('ROW_NOT_FOUND', msg, 404, details);
  }
  static forbidden(msg = 'Operación no permitida', details) {
    return new AppError('FORBIDDEN', msg, 403, details);
  }
  static unauthorized(msg = 'No autorizado', details) {
    return new AppError('AUTH_REQUIRED', msg, 401, details);
  }
  static conflict(msg = 'Conflicto', details) {
    return new AppError('CONFLICT', msg, 409, details);
  }
  static internal(msg = 'Error interno del servidor', details) {
    return new AppError('INTERNAL_ERROR', msg, 500, details);
  }
}

/** Parseos simples de mensajes de Postgres para hacerlos comprensibles */
function pickColumnFromDetail(detail = '') {
  // Ej: 'Key (nombre)=(Harina) already exists.' -> nombre
  const m1 = /Key \(([^)]+)\)=/i.exec(detail);
  if (m1 && m1[1]) return m1[1];

  // Ej: 'null value in column "unidadmedida" violates not-null constraint'
  const m2 = /column "([^"]+)"/i.exec(detail);
  if (m2 && m2[1]) return m2[1];

  return null;
}

/**
 * Mapea códigos SQLSTATE de Postgres/Supabase a AppError con mensajes AMIGABLES.
 * @param err Error nativo de supabase { code, message, details, hint }
 * @param friendly Mensaje más específico (opcional) para sobreescribir el genérico
 */
function fromSupabaseError(err, friendly) {
  const sqlstate = String(err && err.code ? err.code : '').toUpperCase();
  const detailCol = pickColumnFromDetail(err && err.details);

  // Mensajes amigables por defecto (se pueden sobrescribir con `friendly`)
  const msgByCode = {
    '23503': friendly || 'No se puede eliminar: el registro está en uso por otros datos.',
    '23505': friendly || (detailCol
      ? `Ya existe un registro con ese ${detailCol}.`
      : 'Ya existe un registro con esos datos.'),
    '23502': friendly || (detailCol
      ? `Falta completar el campo obligatorio: ${detailCol}.`
      : 'Falta completar un campo obligatorio.'),
    '23514': friendly || 'Los datos no cumplen una regla de validación.',
    '22P02': friendly || 'Algún dato tiene un formato inválido.',
    '22001': friendly || 'Algún texto es demasiado largo.',
    '40001': friendly || 'Conflicto de concurrencia. Probá de nuevo.',
  };

  if (sqlstate && msgByCode[sqlstate]) {
    const statusBy = {
      '23503': 409, // FK violation
      '23505': 409, // unique
      '23502': 400, // not null
      '23514': 400, // check
      '22P02': 400, // invalid format
      '22001': 400, // text too long
      '40001': 409, // serialization failure
    };
    return new AppError(
      sqlstate === '23505' ? 'UNIQUE_CONSTRAINT' :
      sqlstate === '23503' ? 'FOREIGN_KEY_CONFLICT' :
      sqlstate === '23502' ? 'NOT_NULL' :
      sqlstate === '23514' ? 'CHECK_VIOLATION' :
      sqlstate === '22P02' ? 'INVALID_INPUT' :
      sqlstate === '22001' ? 'INVALID_INPUT' :
      sqlstate === '40001' ? 'RETRY' :
      'INTERNAL_ERROR',
      msgByCode[sqlstate],
      statusBy[sqlstate],
      { sqlstate, raw: { message: err?.message, details: err?.details, hint: err?.hint } }
    );
  }

  // Por defecto: error interno con mensaje amable
  return AppError.internal(
    friendly || 'Ocurrió un error al procesar la operación.',
    { sqlstate: sqlstate || 'UNKNOWN', raw: { message: err?.message, details: err?.details, hint: err?.hint } }
  );
}

/** Lanza 404 si no hay filas/resultado */
function assertFound(data, msg = 'Recurso no encontrado') {
  if (data === null || data === undefined || (Array.isArray(data) && data.length === 0)) {
    throw AppError.notFound(msg);
  }
}

/** Respuesta de error uniforme */
function sendError(res, err) {
  const isDev = process.env.NODE_ENV !== 'production';

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,               // ej: 'FOREIGN_KEY_CONFLICT'
        message: err.message,         // amigable para usuario
      },
      ...(isDev ? { details: err.details } : {}), // solo en dev
    });
  }

  const unknown = AppError.internal('Error inesperado', { cause: String(err) });
  if (isDev && err instanceof Error) {
    unknown.details = { ...unknown.details, stack: err.stack };
  }

  return res.status(unknown.status).json({
    error: { code: unknown.code, message: unknown.message },
    ...(isDev ? { details: unknown.details } : {}),
  });
}

module.exports = {
  AppError,
  fromSupabaseError,
  assertFound,
  sendError,
};