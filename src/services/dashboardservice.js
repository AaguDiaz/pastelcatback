﻿const supabase = require('../config/supabase');
const { AppError } = require('../utils/errors');

const DEFAULT_RANGE_DAYS = 30;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const startOfDayUTC = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const startOfISOWeekUTC = (date) => {
  const start = startOfDayUTC(date);
  const day = start.getUTCDay() || 7; // lunes = 1, domingo = 7
  start.setUTCDate(start.getUTCDate() + 1 - day);
  return start;
};

const startOfMonthUTC = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

const getISOWeekNumber = (date) => {
  const tmp = startOfDayUTC(date);
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp - yearStart) / MS_IN_DAY + 1) / 7);
};

const buildBucket = (date, granularity) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  if (granularity === 'month') {
    const start = startOfMonthUTC(d);
    const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    return { key: label, label, start };
  }

  if (granularity === 'week') {
    const start = startOfISOWeekUTC(d);
    const label = `${start.getUTCFullYear()}-W${String(getISOWeekNumber(d)).padStart(2, '0')}`;
    return { key: label, label, start };
  }

  const start = startOfDayUTC(d);
  const label = start.toISOString().slice(0, 10);
  return { key: label, label, start };
};

const determineGranularity = (diffDays) => {
  if (diffDays > 180) return 'month';
  if (diffDays > 45) return 'week';
  return 'day';
};

const normalizeDateRange = (start, end) => {
  const now = new Date();
  let startDate = start ? new Date(start) : new Date(now.getTime() - DEFAULT_RANGE_DAYS * MS_IN_DAY);
  let endDate = end ? new Date(end) : now;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw AppError.badRequest('Rango de fechas invalido');
  }

  if (startDate > endDate) {
    throw AppError.badRequest('La fecha inicial no puede ser posterior a la final');
  }

  startDate = new Date(startDate.getTime());
  startDate.setHours(0, 0, 0, 0);
  endDate = new Date(endDate.getTime());
  endDate.setHours(23, 59, 59, 999);

  return {
    startDate,
    endDate,
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
    diffDays: Math.max(1, Math.ceil((endDate - startDate) / MS_IN_DAY)),
  };
};

const pickField = (row, candidates) => {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined) {
      return { key, value: row[key] };
    }
  }
  return { key: null, value: null };
};

const findLatestBeforeOrOn = (history, limitDate) => {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].date <= limitDate) {
      return history[i];
    }
  }
  return history.length > 0 ? history[history.length - 1] : null;
};

const findBaseline = (history, startDate) => {
  const latestBefore = findLatestBeforeOrOn(history, startDate);
  if (latestBefore) return latestBefore;
  for (let i = 0; i < history.length; i += 1) {
    if (history[i].date >= startDate) {
      return history[i];
    }
  }
  return null;
};

const fetchPedidos = async (startISO, endISO) => {
  let query = supabase
    .from('pedido')
    .select(`
      id,
      fecha_creacion,
      fecha_entrega,
      total_final,
      id_cliente,
      id_estado,
      cliente:cliente (
        id_cliente,
        nombre,
        email,
        telefono,
        direccion,
        observaciones,
        activo
      ),
      estado:estado (
        id_estado,
        estado
      )
    `)
    .order('fecha_creacion', { ascending: true });

  if (startISO) {
    query = query.gte('fecha_creacion', startISO);
  }
  if (endISO) {
    query = query.lte('fecha_creacion', endISO);
  }

  const { data, error } = await query;

  if (!error) {
    return data || [];
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('pedido')
    .select(`
      id,
      fecha_creacion,
      fecha_entrega,
      total_final,
      id_cliente,
      id_estado,
      cliente:cliente (
        id_cliente,
        nombre,
        email,
        telefono,
        direccion,
        observaciones,
        activo
      ),
      estado:estado (
        id_estado,
        estado
      )
    `);

  if (fallbackError) {
    throw new Error('Error al obtener pedidos para el dashboard');
  }

  const startDate = startISO ? new Date(startISO) : null;
  const endDate = endISO ? new Date(endISO) : null;

  return (fallbackData || []).filter((row) => {
    const dateStr = row?.fecha_creacion || row?.fecha_entrega;
    if (!dateStr) return false;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return false;
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  });
};

const fetchPedidoDetalles = async (startISO, endISO) => {
  let query = supabase
    .from('pedido_detalles')
    .select(`
      id_pedido_detalle,
      id_pedido,
      id_torta,
      id_bandeja,
      cantidad,
      precio_unitario,
      pedido:pedido!inner (
        id,
        fecha_creacion
      ),
      torta:torta (
        id_torta,
        nombre,
        precio
      ),
      bandeja:bandeja (
        id_bandeja,
        nombre,
        precio
      )
    `);

  if (startISO) {
    query = query.gte('pedido.fecha_creacion', startISO);
  }
  if (endISO) {
    query = query.lte('pedido.fecha_creacion', endISO);
  }

  const { data, error } = await query;

  if (!error) {
    return data || [];
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('pedido_detalles')
    .select(`
      id_pedido_detalle,
      id_pedido,
      id_torta,
      id_bandeja,
      cantidad,
      precio_unitario,
      pedido:pedido (
        id,
        fecha_creacion
      ),
      torta:torta (
        id_torta,
        nombre,
        precio
      ),
      bandeja:bandeja (
        id_bandeja,
        nombre,
        precio
      )
    `);

  if (fallbackError) {
    throw new Error('Error al obtener detalles de pedidos para el dashboard');
  }

  const startDate = startISO ? new Date(startISO) : null;
  const endDate = endISO ? new Date(endISO) : null;

  return (fallbackData || []).filter((row) => {
    const dateStr = row?.pedido?.fecha_creacion;
    if (!dateStr) return false;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return false;
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  });
};

const fetchMateriasPrimas = async () => {
  const { data, error } = await supabase
    .from('materiaprima')
    .select('id_materiaprima, nombre');

  if (error) {
    throw new Error('Error al obtener materias primas');
  }

  return data || [];
};

const fetchHistorialPrecios = async (endISO) => {
  const table = 'historialprecios';
  const dateColumns = ['fechacambio', 'fecha', 'fecha_cambio', 'fecha_registro', 'fechaactual', 'created_at', 'fecha_actualizacion'];

  for (const column of dateColumns) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .lte(column, endISO)
      .order(column, { ascending: true });

    if (!error) {
      return { data: data || [], dateColumn: column };
    }
  }

  const { data, error } = await supabase
    .from(table)
    .select('*');

  if (error) {
    return { data: [], dateColumn: null };
  }

  return { data: data || [], dateColumn: null };
};

const buildKpis = (pedidos) => {
  const totalRevenue = pedidos.reduce((acc, pedido) => acc + toNumber(pedido.total_final), 0);
  const totalOrders = pedidos.length;
  const ticketPromedio = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return {
    ingresosTotales: round(totalRevenue),
    totalPedidos: totalOrders,
    ticketPromedio: round(ticketPromedio),
  };
};

const buildRevenueTrend = (pedidos, granularity) => {
  const map = new Map();

  pedidos.forEach((pedido) => {
    const dateStr = pedido?.fecha_creacion || pedido?.fecha_entrega;
    if (!dateStr) return;
    const bucket = buildBucket(dateStr, granularity);
    if (!bucket) return;

    const entry = map.get(bucket.key) || {
      key: bucket.key,
      label: bucket.label,
      periodStart: bucket.start,
      ingresos: 0,
      pedidos: 0,
    };

    entry.ingresos += toNumber(pedido.total_final);
    entry.pedidos += 1;
    map.set(bucket.key, entry);
  });

  const series = Array.from(map.values())
    .sort((a, b) => a.periodStart - b.periodStart)
    .map((item) => ({
      key: item.key,
      label: item.label,
      periodStart: item.periodStart.toISOString(),
      ingresos: round(item.ingresos),
      pedidos: item.pedidos,
    }));

  return {
    granularity,
    series,
  };
};

const buildStatusBreakdown = (pedidos) => {
  const map = new Map();

  pedidos.forEach((pedido) => {
    const rawStatus = pedido?.estado?.estado ?? pedido?.estado ?? 'Sin estado';
    const status = typeof rawStatus === 'string' && rawStatus.trim() ? rawStatus.trim() : 'Sin estado';
    const entry = map.get(status) || { estado: status, cantidad: 0 };
    entry.cantidad += 1;
    map.set(status, entry);
  });

  return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad);
};

const buildTopClients = (pedidos) => {
  const map = new Map();

  pedidos.forEach((pedido) => {
    const cliente = pedido?.cliente || {};
    const id = pedido?.id_cliente ?? cliente?.id_cliente ?? cliente?.id ?? null;
    if (!id) return;

    const entry = map.get(id) || {
      id_cliente: id,
      nombre: cliente?.nombre || `Cliente ${id}`,
      email: cliente?.email ?? cliente?.correo ?? null,
      totalGastado: 0,
      cantidadPedidos: 0,
    };

    entry.totalGastado += toNumber(pedido.total_final);
    entry.cantidadPedidos += 1;
    entry.nombre = cliente?.nombre || entry.nombre;
    entry.email = cliente?.email ?? cliente?.correo ?? entry.email;
    map.set(id, entry);
  });

  return Array.from(map.values())
    .sort((a, b) => b.totalGastado - a.totalGastado)
    .slice(0, 10)
    .map((item) => ({
      id_cliente: item.id_cliente,
      nombre: item.nombre,
      email: item.email || null,
      totalGastado: round(item.totalGastado),
      cantidadPedidos: item.cantidadPedidos,
    }));
};

const buildProductsPerformance = (detalles) => {
  const tortasMap = new Map();
  const productosMap = new Map();

  detalles.forEach((detalle) => {
    const cantidad = toNumber(detalle?.cantidad);
    if (!cantidad) return;
    const precio = toNumber(detalle?.precio_unitario);
    const ingresos = precio * cantidad;

    const tortaId = detalle?.id_torta ?? detalle?.torta?.id_torta ?? null;
    const bandejaId = detalle?.id_bandeja ?? detalle?.bandeja?.id_bandeja ?? null;

    if (tortaId) {
      const key = String(tortaId);
      const nombreTorta = detalle?.torta?.nombre || `Torta ${tortaId}`;
      const entry = tortasMap.get(key) || { id_torta: tortaId, nombre: nombreTorta, ingresos: 0, cantidad: 0 };
      entry.ingresos += ingresos;
      entry.cantidad += cantidad;
      entry.nombre = nombreTorta;
      tortasMap.set(key, entry);
    }

    const productId = tortaId ? `torta-${tortaId}` : bandejaId ? `bandeja-${bandejaId}` : null;
    if (!productId) return;

    const nombreProducto = tortaId
      ? detalle?.torta?.nombre || `Torta ${tortaId}`
      : detalle?.bandeja?.nombre || `Bandeja ${bandejaId}`;

    const entry = productosMap.get(productId) || {
      id: tortaId ? tortaId : bandejaId,
      tipo: tortaId ? 'torta' : 'bandeja',
      nombre: nombreProducto,
      cantidadVendida: 0,
      ingresosTotales: 0,
    };

    entry.cantidadVendida += cantidad;
    entry.ingresosTotales += ingresos;
    entry.nombre = nombreProducto;
    productosMap.set(productId, entry);
  });

  const topTortas = Array.from(tortasMap.values())
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 10)
    .map((item) => ({
      id_torta: item.id_torta,
      nombre: item.nombre,
      ingresos: round(item.ingresos),
      cantidad: item.cantidad,
    }));

  const tablaProductos = Array.from(productosMap.values())
    .map((item) => ({
      id: item.id,
      tipo: item.tipo,
      nombre: item.nombre,
      cantidadVendida: item.cantidadVendida,
      ingresosTotales: round(item.ingresosTotales),
      precioPromedio: item.cantidadVendida > 0 ? round(item.ingresosTotales / item.cantidadVendida) : 0,
    }))
    .sort((a, b) => b.ingresosTotales - a.ingresosTotales);

  return {
    topTortas,
    tablaProductos,
  };
};

const buildMaterialPriceIncreases = (historialData, materias, range) => {
  if (!Array.isArray(historialData) || historialData.length === 0) {
    return [];
  }

  const materiasMap = new Map();
  materias.forEach((mat) => {
    if (!mat) return;
    const id = mat?.id_materiaprima ?? mat?.id ?? mat?.idMateriaPrima;
    if (id === null || id === undefined) return;

    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;

    const fallbackName = `Materia ${numericId}`;
    materiasMap.set(numericId, mat?.nombre || fallbackName);
  });

  const grouped = new Map();

  historialData.forEach((row) => {
    if (!row || typeof row !== 'object') return;

    const { value: materiaIdRaw } = pickField(row, ['id_materiaprima', 'materiaprima_id', 'materia_prima_id', 'idmateriaprima', 'idMateriaPrima']);
    const { value: priceRaw } = pickField(row, ['precio', 'precio_unitario', 'preciounitario', 'precio_actual', 'precioactual', 'precio_total', 'preciototal']);
    const { value: dateRaw } = pickField(row, ['fechacambio', 'fecha', 'fecha_cambio', 'fecha_registro', 'fechaactual', 'created_at', 'fecha_actualizacion']);

    if (materiaIdRaw === null || dateRaw === null || priceRaw === null) return;

    const materiaId = Number(materiaIdRaw);
    const price = toNumber(priceRaw);
    const date = new Date(dateRaw);

    if (!Number.isFinite(materiaId) || Number.isNaN(date.getTime())) return;
    if (date > range.endDate) return;

    const history = grouped.get(materiaId) || [];
    history.push({ date, price });
    grouped.set(materiaId, history);
  });

  const results = [];

  grouped.forEach((history, materiaId) => {
    history.sort((a, b) => a.date - b.date);
    const baseline = findBaseline(history, range.startDate);
    const final = findLatestBeforeOrOn(history, range.endDate);

    if (!baseline || !final) return;
    if (!Number.isFinite(baseline.price) || baseline.price <= 0) return;

    const change = ((final.price - baseline.price) / baseline.price) * 100;
    if (!Number.isFinite(change)) return;

    results.push({
      id_materiaprima: materiaId,
      nombre: materiasMap.get(materiaId) || `Materia ${materiaId}`,
      variacionPorcentual: round(change),
      precioInicial: round(baseline.price),
      precioFinal: round(final.price),
      fechaInicial: baseline.date.toISOString(),
      fechaFinal: final.date.toISOString(),
    });
  });

  if (!results.length) {
    return [];
  }

  const positive = results
    .filter((item) => item.variacionPorcentual > 0)
    .sort((a, b) => b.variacionPorcentual - a.variacionPorcentual)
    .slice(0, 5);

  if (positive.length >= 5) {
    return positive;
  }

  const remaining = results
    .filter((item) => item.variacionPorcentual <= 0)
    .sort((a, b) => b.variacionPorcentual - a.variacionPorcentual)
    .slice(0, 5 - positive.length);

  return positive.concat(remaining);
};

const getDashboardData = async ({ startDate, endDate } = {}) => {
  const range = normalizeDateRange(startDate, endDate);
  const granularity = determineGranularity(range.diffDays);

  const [pedidos, detalles, materias, historial] = await Promise.all([
    fetchPedidos(range.startISO, range.endISO),
    fetchPedidoDetalles(range.startISO, range.endISO),
    fetchMateriasPrimas(),
    fetchHistorialPrecios(range.endISO),
  ]);

  return {
    filtros: {
      fechaInicio: range.startISO,
      fechaFin: range.endISO,
      granularidad: granularity,
    },
    resumen: buildKpis(pedidos),
    ventas: {
      tendenciaIngresos: buildRevenueTrend(pedidos, granularity),
      pedidosPorEstado: buildStatusBreakdown(pedidos),
      materiasPrimaMasCaras: buildMaterialPriceIncreases(historial.data, materias, range),
    },
    productos: buildProductsPerformance(detalles),
    clientes: {
      top: buildTopClients(pedidos),
    },
  };
};

module.exports = {
  getDashboardData,
};








