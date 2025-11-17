const supabase = require('../config/supabase');
const { AppError, fromSupabaseError, assertFound } = require('../utils/errors');
const { CATEGORY_INACTIVE_ID } = require('./articuloservice');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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

const normalizeCategoriaId = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.badRequest('El id de la categoría es inválido.');
  }
  return parsed;
};

const formatCategoria = (row) => ({
  id_categoria: row.id_categoria,
  nombre: row.nombre,
});

const validateCategoriaPayload = (payload = {}) => {
  const nombre = sanitizeString(payload.nombre);
  if (!nombre) {
    throw AppError.badRequest('El nombre de la categoría es obligatorio.');
  }
  return { nombre };
};

const getCategorias = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, search = '' } = {}) => {
  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;

  let query = supabase
    .from('categoria')
    .select('*', { count: 'exact' })
    .order('nombre', { ascending: true })
    .range(start, end);

  const safeSearch = sanitizeString(search);
  if (safeSearch) {
    query = query.ilike('nombre', `%${safeSearch}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener las categorías.');
  }

  return {
    data: (data || []).map(formatCategoria),
    totalPages: Math.ceil((count || 0) / safePageSize),
    currentPage: safePage,
    pageSize: safePageSize,
    totalItems: count || 0,
  };
};

const createCategoria = async (payload) => {
  const values = validateCategoriaPayload(payload);
  const { data, error } = await supabase
    .from('categoria')
    .insert(values)
    .select('*');

  if (error) {
    throw fromSupabaseError(error, 'No se pudo crear la categoría.');
  }

  return formatCategoria(data[0]);
};

const updateCategoria = async (id, payload) => {
  const categoriaId = normalizeCategoriaId(id);
  const values = validateCategoriaPayload(payload);

  const { data, error } = await supabase
    .from('categoria')
    .update(values)
    .eq('id_categoria', categoriaId)
    .select('*');

  if (error) {
    throw fromSupabaseError(error, 'No se pudo actualizar la categoría.');
  }

  assertFound(data, 'La categoría no existe.');
  return formatCategoria(data[0]);
};

const deleteCategoria = async (id) => {
  const categoriaId = normalizeCategoriaId(id);

  if (categoriaId === CATEGORY_INACTIVE_ID) {
    throw AppError.badRequest('No se puede eliminar la categoría configurada para dar de baja artículos.');
  }

  const { count, error: countErr } = await supabase
    .from('articulo')
    .select('*', { count: 'exact', head: true })
    .eq('id_categoria', categoriaId);

  if (countErr) {
    throw fromSupabaseError(countErr, 'No se pudo verificar el uso de la categoría.');
  }

  if ((count ?? 0) > 0) {
    throw AppError.conflict('No se puede eliminar la categoría porque existen artículos que la utilizan.');
  }

  const { data, error } = await supabase
    .from('categoria')
    .delete()
    .eq('id_categoria', categoriaId)
    .select('id_categoria');

  if (error) {
    throw fromSupabaseError(error, 'No se pudo eliminar la categoría.');
  }

  assertFound(data, 'La categoría no existe o ya fue eliminada.');
  return { deleted: true };
};

module.exports = {
  getCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
};
