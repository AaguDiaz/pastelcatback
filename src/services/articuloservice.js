const supabase = require('../config/supabase');
const { AppError, fromSupabaseError, assertFound } = require('../utils/errors');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const CATEGORY_INACTIVE_ID = 1;

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const normalizePageSize = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
};

const toInteger = (value, field) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw AppError.badRequest(`El campo ${field} debe ser un número entero válido.`);
  }
  return parsed;
};

const toNonNegativeInteger = (value, field) => {
  const parsed = toInteger(value, field);
  if (parsed < 0) {
    throw AppError.badRequest(`El campo ${field} no puede ser negativo.`);
  }
  return parsed;
};

const toMoneyString = (value, field) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw AppError.badRequest(`El campo ${field} debe ser un número válido.`);
  }
  return parsed.toString();
};

const toBoolean = (value, field) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }
  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }
  throw AppError.badRequest(`El campo ${field} debe ser booleano.`);
};

const normalizeArticuloId = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.badRequest('El id del artículo es inválido.');
  }
  return parsed;
};

const formatArticulo = (row) => ({
  id_articulo: row.id_articulo,
  nombre: row.nombre,
  id_categoria: row.id_categoria,
  reutilizable: row.reutilizable,
  color: row.color ?? null,
  tamanio: row.tamanio ?? null,
  stock_total: row.stock_total,
  stock_disponible: row.stock_disponible,
  costo_unitario: row.costo_unitario,
  precio_alquiler: row.precio_alquiler,
});

const validateArticuloPayload = (payload = {}) => {
  const nombre = sanitizeString(payload.nombre);
  if (!nombre) {
    throw AppError.badRequest('El nombre del artículo es obligatorio.');
  }

  const idCategoria = toInteger(payload.id_categoria, 'id_categoria');
  if (idCategoria <= 0) {
    throw AppError.badRequest('La categoría es obligatoria.');
  }

  const reutilizable = toBoolean(payload.reutilizable, 'reutilizable');
  const stockTotal = toNonNegativeInteger(payload.stock_total, 'stock_total');
  const stockDisponible = toNonNegativeInteger(payload.stock_disponible, 'stock_disponible');

  if (stockDisponible > stockTotal) {
    throw AppError.badRequest('El stock disponible no puede superar al stock total.');
  }

  const costoUnitario = toMoneyString(payload.costo_unitario, 'costo_unitario');
  const precioAlquiler = Number(payload.precio_alquiler);
  if (!Number.isFinite(precioAlquiler) || precioAlquiler < 0) {
    throw AppError.badRequest('El precio de alquiler debe ser un número válido.');
  }

  const color = sanitizeString(payload.color);
  const tamanio = sanitizeString(payload.tamanio);

  return {
    nombre,
    id_categoria: idCategoria,
    reutilizable,
    color: color || null,
    tamanio: tamanio || null,
    stock_total: stockTotal,
    stock_disponible: stockDisponible,
    costo_unitario: costoUnitario,
    precio_alquiler: precioAlquiler,
  };
};

const getArticulos = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, search = '', categoriaId } = {}) => {
  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;

  let query = supabase
    .from('Articulo')
    .select('*', { count: 'exact' })
    .order('nombre', { ascending: true })
    .range(start, end);

  const safeSearch = sanitizeString(search);
  if (safeSearch) {
    query = query.ilike('nombre', `%${safeSearch}%`);
  }

  if (categoriaId) {
    const parsedCategoria = toInteger(categoriaId, 'categoriaId');
    query = query.eq('id_categoria', parsedCategoria);
  }

  const { data, count, error } = await query;
  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener los artículos.');
  }

  return {
    data: (data || []).map(formatArticulo),
    totalPages: Math.ceil((count || 0) / safePageSize),
    currentPage: safePage,
    pageSize: safePageSize,
    totalItems: count || 0,
  };
};

const createArticulo = async (payload) => {
  const values = validateArticuloPayload(payload);

  const { data, error } = await supabase
    .from('Articulo')
    .insert(values)
    .select('*');

  if (error) {
    throw fromSupabaseError(error, 'No se pudo crear el artículo.');
  }

  return formatArticulo(data[0]);
};

const updateArticulo = async (id, payload) => {
  const articuloId = normalizeArticuloId(id);
  const values = validateArticuloPayload(payload);

  const { data, error } = await supabase
    .from('Articulo')
    .update(values)
    .eq('id_articulo', articuloId)
    .select('*');

  if (error) {
    throw fromSupabaseError(error, 'No se pudo actualizar el artículo.');
  }

  assertFound(data, 'El artículo no existe.');
  return formatArticulo(data[0]);
};

const deleteArticulo = async (id) => {
  const articuloId = normalizeArticuloId(id);

  const { data: existing, error: fetchErr } = await supabase
    .from('Articulo')
    .select('id_articulo, id_categoria')
    .eq('id_articulo', articuloId);

  if (fetchErr) {
    throw fromSupabaseError(fetchErr, 'No se pudo verificar el artículo.');
  }

  assertFound(existing, 'El artículo no existe.');
  const articulo = existing[0];

  const { count, error: countErr } = await supabase
    .from('lista_evento')
    .select('*', { count: 'exact', head: true })
    .eq('id_articulo', articuloId);

  if (countErr) {
    throw fromSupabaseError(countErr, 'No se pudo verificar el uso del artículo en eventos.');
  }

  if ((count ?? 0) > 0) {
    if (articulo.id_categoria === CATEGORY_INACTIVE_ID) {
      return {
        action: 'MARKED_INACTIVE',
        message: 'El artículo ya estaba marcado como dado de baja.',
        articulo: {
          id_articulo: articuloId,
          id_categoria: CATEGORY_INACTIVE_ID,
        },
        eventosCount: count,
      };
    }

    const { data: updated, error: updateErr } = await supabase
      .from('Articulo')
      .update({ id_categoria: CATEGORY_INACTIVE_ID })
      .eq('id_articulo', articuloId)
      .select('id_articulo, id_categoria');

    if (updateErr) {
      throw fromSupabaseError(updateErr, 'No se pudo marcar el artículo como dado de baja.');
    }

    return {
      action: 'MARKED_INACTIVE',
      message: 'El artículo está en uso. Se actualizó su categoría a "dado de baja".',
      articulo: updated[0],
      eventosCount: count,
    };
  }

  const { data: deleted, error: deleteErr } = await supabase
    .from('Articulo')
    .delete()
    .eq('id_articulo', articuloId)
    .select('id_articulo');

  if (deleteErr) {
    throw fromSupabaseError(deleteErr, 'No se pudo eliminar el artículo.');
  }

  assertFound(deleted, 'El artículo no existe o ya fue eliminado.');
  return { action: 'DELETED' };
};

module.exports = {
  CATEGORY_INACTIVE_ID,
  getArticulos,
  createArticulo,
  updateArticulo,
  deleteArticulo,
};
