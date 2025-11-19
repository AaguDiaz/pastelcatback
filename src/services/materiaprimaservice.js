const supabase = require('../config/supabase');
const { AppError, fromSupabaseError, assertFound } = require('../utils/errors');

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LIST_PAGE_SIZE = 10;
const DEFAULT_HIST_PAGE_SIZE = 25;
const MAX_HIST_PAGE_SIZE = 100;
const DEFAULT_TOP_CHANGES = 5;
const MAX_TOP_CHANGES = 15;
const HIST_DEFAULT_RANGE_DAYS = 90;

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const parseMateriaPrimaId = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.badRequest('El identificador de la materia prima es invalido.');
  }
  return parsed;
};

const normalizePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const normalizeHistoryPageSize = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HIST_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_HIST_PAGE_SIZE);
};

const normalizeTopLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TOP_CHANGES;
  }
  return Math.min(parsed, MAX_TOP_CHANGES);
};

const parseDateInput = (value, field) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.badRequest(`El valor de fecha en ${field} es invalido.`);
  }
  return date;
};

const buildOptionalRange = (startDate, endDate) => {
  const start = parseDateInput(startDate, 'startDate');
  const end = parseDateInput(endDate, 'endDate');

  if (!start && !end) {
    return { startISO: null, endISO: null };
  }

  const safeEnd = end ? new Date(end.getTime()) : new Date();
  safeEnd.setUTCHours(23, 59, 59, 999);

  const safeStart = start
    ? new Date(start.getTime())
    : new Date(safeEnd.getTime() - HIST_DEFAULT_RANGE_DAYS * MS_IN_DAY);
  safeStart.setUTCHours(0, 0, 0, 0);

  if (safeStart > safeEnd) {
    throw AppError.badRequest('El rango de fechas es invalido.');
  }

  return {
    startISO: safeStart.toISOString(),
    endISO: safeEnd.toISOString(),
  };
};

const buildRequiredRange = (startDate, endDate) => {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - HIST_DEFAULT_RANGE_DAYS * MS_IN_DAY);
  defaultStart.setUTCHours(0, 0, 0, 0);
  const defaultEnd = new Date(now.getTime());
  defaultEnd.setUTCHours(23, 59, 59, 999);

  return buildOptionalRange(startDate || defaultStart.toISOString(), endDate || defaultEnd.toISOString());
};

const fetchMateriaPrimaById = async (id) => {
  const { data, error } = await supabase
    .from('materiaprima')
    .select('*')
    .eq('id_materiaprima', id)
    .maybeSingle();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo obtener la materia prima solicitada.');
  }

  return data;
};

const logMateriaPrimaSnapshot = async (materiaPrima) => {
  if (!materiaPrima?.id_materiaprima) {
    return;
  }

  const snapshot = {
    id_materiaprima: materiaPrima.id_materiaprima,
    cantidad: materiaPrima.cantidad,
    preciototal: materiaPrima.preciototal,
    unidadmedida: materiaPrima.unidadmedida,
    fechacambio: new Date().toISOString(),
  };

  const { error } = await supabase.from('historialprecios').insert(snapshot);
  if (error) {
    throw fromSupabaseError(error, 'No se pudo registrar el historial antes de actualizar la materia prima.');
  }
};

const fetchMateriasByIds = async (ids = []) => {
  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .select('id_materiaprima, nombre, unidadmedida, preciototal')
    .in('id_materiaprima', ids);

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener los datos de las materias primas.');
  }

  const map = new Map();
  (data || []).forEach((row) => {
    if (row?.id_materiaprima) {
      map.set(row.id_materiaprima, row);
    }
  });
  return map;
};

const getMateriasPrimas = async (page = 1, search = '') => {
  const safePage = normalizePage(page);
  const start = (safePage - 1) * DEFAULT_LIST_PAGE_SIZE;
  const end = start + DEFAULT_LIST_PAGE_SIZE - 1;
  const sanitizedSearch = sanitizeString(search);

  let query = supabase
    .from('materiaprima')
    .select('*', { count: 'exact' })
    .range(start, end);

  if (sanitizedSearch) {
    query = query.ilike('nombre', `%${sanitizedSearch}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw fromSupabaseError(error, 'Error al obtener materias primas');
  }

  return {
    data: data || [],
    totalPages: Math.ceil((count || 0) / DEFAULT_LIST_PAGE_SIZE),
    currentPage: safePage,
  };
};

const createMateriaPrima = async ({ nombre, unidadmedida, cantidad, preciototal }) => {
  const safeNombre = sanitizeString(nombre);
  const safeUnidad = sanitizeString(unidadmedida);

  if (!safeNombre || !safeUnidad || cantidad == null || preciototal == null) {
    throw AppError.badRequest('Faltan campos requeridos.');
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .insert({ nombre: safeNombre, unidadmedida: safeUnidad, cantidad, preciototal })
    .select('*')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'Error al agregar materia prima');
  }

  return data;
};

const updateMateriaPrima = async (id, { nombre, unidadmedida, cantidad, preciototal }) => {
  const safeNombre = sanitizeString(nombre);
  const safeUnidad = sanitizeString(unidadmedida);

  if (!safeNombre || !safeUnidad || cantidad == null || preciototal == null) {
    throw AppError.badRequest('Faltan campos requeridos.');
  }

  const materiaId = parseMateriaPrimaId(id);
  const current = await fetchMateriaPrimaById(materiaId);

  if (!current) {
    throw AppError.notFound('La materia prima seleccionada no existe.');
  }

  await logMateriaPrimaSnapshot(current);

  const { data, error } = await supabase
    .from('materiaprima')
    .update({ nombre: safeNombre, unidadmedida: safeUnidad, cantidad, preciototal })
    .eq('id_materiaprima', materiaId)
    .select('*')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo actualizar la materia prima.');
  }

  return data;
};

const deleteMateriaPrima = async (id) => {
  const materiaId = parseMateriaPrimaId(id);

  const { count, error: countErr } = await supabase
    .from('ingredientereceta')
    .select('*', { count: 'exact', head: true })
    .eq('id_materiaprima', materiaId);

  if (countErr) throw fromSupabaseError(countErr, 'No se pudo verificar el uso de la materia prima.');
  if ((count ?? 0) > 0) {
    throw AppError.conflict(`No se puede eliminar: esta usada en ${count} receta(s).`);
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .delete()
    .eq('id_materiaprima', materiaId)
    .select('id_materiaprima');

  if (error) throw fromSupabaseError(error, 'No se pudo eliminar la materia prima.');
  assertFound(data, 'La materia prima no existe o ya fue eliminada.');
};

const listHistorialPrecios = async ({ page = 1, pageSize = DEFAULT_HIST_PAGE_SIZE, materiaId, startDate, endDate } = {}) => {
  const safePage = normalizePage(page);
  const safePageSize = normalizeHistoryPageSize(pageSize);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;
  const range = buildOptionalRange(startDate, endDate);

  let query = supabase
    .from('historialprecios')
    .select('id_historial, id_materiaprima, cantidad, preciototal, unidadmedida, fechacambio', { count: 'exact' })
    .order('fechacambio', { ascending: false })
    .range(start, end);

  if (range.startISO) {
    query = query.gte('fechacambio', range.startISO);
  }
  if (range.endISO) {
    query = query.lte('fechacambio', range.endISO);
  }

  let materiaFilter = null;
  if (materiaId) {
    materiaFilter = parseMateriaPrimaId(materiaId);
    query = query.eq('id_materiaprima', materiaFilter);
  }

  const { data, error, count } = await query;
  if (error) {
    throw fromSupabaseError(error, 'No se pudo obtener el historial de precios.');
  }

  const rows = data || [];
  const materiaIds = [...new Set(rows.map((row) => Number(row.id_materiaprima)).filter((value) => Number.isFinite(value)))];
  const materiasMap = await fetchMateriasByIds(materiaIds);

  const formatted = rows.map((row) => {
    const materia = materiasMap.get(row.id_materiaprima);
    const precioActual = toNumber(materia?.preciototal);
    return {
      id_historial: row.id_historial,
      id_materiaprima: row.id_materiaprima,
      nombre: materia?.nombre ?? null,
      unidadmedida: row.unidadmedida || materia?.unidadmedida || null,
      cantidad: toNumber(row.cantidad),
      precio_anterior: toNumber(row.preciototal),
      precio_actual: precioActual,
      fechacambio: row.fechacambio,
    };
  });

  return {
    data: formatted,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalItems: count || 0,
      totalPages: Math.ceil((count || 0) / safePageSize),
    },
    filters: {
      materiaId: materiaFilter,
      startDate: range.startISO,
      endDate: range.endISO,
    },
  };
};

const getMateriasMasCambiadas = async ({ startDate, endDate, limit = DEFAULT_TOP_CHANGES } = {}) => {
  const range = buildRequiredRange(startDate, endDate);
  const safeLimit = normalizeTopLimit(limit);

  let query = supabase
    .from('historialprecios')
    .select('id_materiaprima, cantidad, preciototal, unidadmedida, fechacambio')
    .order('fechacambio', { ascending: true });

  if (range.startISO) {
    query = query.gte('fechacambio', range.startISO);
  }
  if (range.endISO) {
    query = query.lte('fechacambio', range.endISO);
  }

  const { data, error } = await query;
  if (error) {
    throw fromSupabaseError(error, 'No se pudo calcular los cambios de materias primas.');
  }

  const grouped = new Map();
  (data || []).forEach((row) => {
    const materiaId = Number(row.id_materiaprima);
    if (!Number.isFinite(materiaId)) {
      return;
    }
    const history = grouped.get(materiaId) || [];
    history.push(row);
    grouped.set(materiaId, history);
  });

  const materiaIds = Array.from(grouped.keys());
  const materiasMap = await fetchMateriasByIds(materiaIds);

  const summary = [];
  grouped.forEach((history, materiaId) => {
    history.sort((a, b) => new Date(a.fechacambio) - new Date(b.fechacambio));
    const first = history[0];
    const last = history[history.length - 1];
    const materia = materiasMap.get(materiaId);

    const precioAnterior = toNumber(first?.preciototal);
    const precioActual = toNumber(materia?.preciototal);

    if (precioAnterior === null || precioActual === null) {
      return;
    }

    const variacionAbsoluta = Number((precioActual - precioAnterior).toFixed(2));
    const variacionPorcentual =
      precioAnterior !== 0 ? Number(((variacionAbsoluta / precioAnterior) * 100).toFixed(2)) : null;

    summary.push({
      id_materiaprima: materiaId,
      nombre: materia?.nombre ?? null,
      unidadmedida: materia?.unidadmedida ?? null,
      cambios: history.length,
      precioAnterior,
      precioActual,
      variacionAbsoluta,
      variacionPorcentual,
      primerCambio: first?.fechacambio ?? null,
      ultimoCambio: last?.fechacambio ?? null,
    });
  });

  summary.sort((a, b) => {
    const aDelta = Math.abs(a.variacionPorcentual ?? 0);
    const bDelta = Math.abs(b.variacionPorcentual ?? 0);
    if (bDelta !== aDelta) {
      return bDelta - aDelta;
    }
    const absA = Math.abs(a.variacionAbsoluta ?? 0);
    const absB = Math.abs(b.variacionAbsoluta ?? 0);
    if (absB !== absA) {
      return absB - absA;
    }
    return (b.ultimoCambio || '').localeCompare(a.ultimoCambio || '');
  });

  const enriched = summary.slice(0, safeLimit);

  return {
    range: {
      startDate: range.startISO,
      endDate: range.endISO,
    },
    limit: safeLimit,
    data: enriched,
  };
};

module.exports = {
  getMateriasPrimas,
  createMateriaPrima,
  updateMateriaPrima,
  deleteMateriaPrima,
  listHistorialPrecios,
  getMateriasMasCambiadas,
};
