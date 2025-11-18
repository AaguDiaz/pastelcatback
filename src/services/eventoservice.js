const supabase = require('../config/supabase');
const { fromSupabaseError } = require('../utils/errors');

const ITEMS_PER_PAGE = 10;
const ESTADO_PENDIENTE = 'pendiente';

const reloadSchemaCache = async () => {
  try {
    await supabase.rpc('reload_schema');
  } catch (err) {
    console.warn('No se pudo refrescar la cache de esquema de PostgREST', err?.message || err);
  }
};

const toUniqueNumberIds = (values = []) => {
  const ids = new Set();
  values.forEach((value) => {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      ids.add(num);
    }
  });
  return Array.from(ids);
};

const fetchMapByIds = async ({ table, idField, selectFields, ids, errorMessage }) => {
  const uniqueIds = toUniqueNumberIds(ids);
  if (!uniqueIds.length) return new Map();
  const { data, error } = await supabase.from(table).select(selectFields).in(idField, uniqueIds);
  if (error) {
    throw fromSupabaseError(error, errorMessage);
  }
  const map = new Map();
  (data || []).forEach((row) => {
    const key = row?.[idField];
    if (key !== undefined && key !== null) {
      map.set(Number(key), row);
    }
  });
  return map;
};

const fetchPerfilesMap = async (ids = []) => {
  return fetchMapByIds({
    table: 'perfil',
    idField: 'id_perfil',
    selectFields: 'id_perfil, nombre, telefono, direccion, dni, is_active, id',
    ids,
    errorMessage: 'Error al obtener perfiles',
  });
};

const fetchEstadosMap = async (ids = []) => {
  const baseMap = await fetchMapByIds({
    table: 'estado',
    idField: 'id_estado',
    selectFields: 'id_estado, estado',
    ids,
    errorMessage: 'Error al obtener estados',
  });
  const map = new Map();
  baseMap.forEach((row, key) => {
    map.set(key, row.estado);
  });
  return map;
};

const buildPerfilPayload = (row) => {
  if (!row) return null;
  return {
    id_perfil: row.id_perfil,
    nombre: row.nombre ?? null,
    telefono: row.telefono ?? null,
    direccion: row.direccion ?? null,
    dni: row.dni ?? null,
    is_active: typeof row.is_active === 'boolean' ? row.is_active : null,
    id: row.id ?? null,
  };
};

const attachPerfilAndEstado = async (evento) => {
  if (!evento) return null;
  const [perfilMap, estadoMap] = await Promise.all([
    fetchPerfilesMap(evento.id_perfil ? [evento.id_perfil] : []),
    fetchEstadosMap(evento.id_estado ? [evento.id_estado] : []),
  ]);
  const perfilRow = perfilMap.get(Number(evento.id_perfil));
  const estadoNombre = estadoMap.get(Number(evento.id_estado));
  return {
    ...evento,
    perfil: buildPerfilPayload(perfilRow),
    estado: estadoNombre ? { estado: estadoNombre } : null,
  };
};

const fetchTortasMap = async (ids = []) => {
  const map = await fetchMapByIds({
    table: 'torta',
    idField: 'id_torta',
    selectFields: 'id_torta, nombre, precio, imagen, tamanio',
    ids,
    errorMessage: 'Error al obtener tortas',
  });
  const formatted = new Map();
  map.forEach((row, key) => {
    formatted.set(key, {
      id: row.id_torta,
      id_torta: row.id_torta,
      nombre: row.nombre ?? null,
      precio: row.precio ?? null,
      imagen: row.imagen ?? null,
      tamanio: row.tamanio ?? null,
    });
  });
  return formatted;
};

const fetchBandejasMap = async (ids = []) => {
  const map = await fetchMapByIds({
    table: 'bandeja',
    idField: 'id_bandeja',
    selectFields: 'id_bandeja, nombre, precio, imagen, tamanio',
    ids,
    errorMessage: 'Error al obtener bandejas',
  });
  const formatted = new Map();
  map.forEach((row, key) => {
    formatted.set(key, {
      id: row.id_bandeja,
      id_bandeja: row.id_bandeja,
      nombre: row.nombre ?? null,
      precio: row.precio ?? null,
      imagen: row.imagen ?? null,
      tamanio: row.tamanio ?? null,
    });
  });
  return formatted;
};

const fetchArticulosMap = async (ids = []) => {
  const map = await fetchMapByIds({
    table: 'Articulo',
    idField: 'id_articulo',
    selectFields:
      'id_articulo, nombre, precio_alquiler, costo_unitario, color, tamanio, stock_total, stock_disponible, id_categoria',
    ids,
    errorMessage: 'Error al obtener artículos',
  });
  const categoriaIds = Array.from(map.values())
    .map((row) => row.id_categoria)
    .filter((value) => Number.isFinite(Number(value)));
  const categoriaMap = await fetchMapByIds({
    table: 'categoria',
    idField: 'id_categoria',
    selectFields: 'id_categoria, nombre',
    ids: categoriaIds,
    errorMessage: 'Error al obtener categorías',
  });
  const formatted = new Map();
  map.forEach((row, key) => {
    const categoriaRow = row.id_categoria ? categoriaMap.get(Number(row.id_categoria)) : null;
    formatted.set(key, {
      id: row.id_articulo,
      id_articulo: row.id_articulo,
      nombre: row.nombre ?? null,
      precio_alquiler: row.precio_alquiler ?? null,
      costo_unitario: row.costo_unitario ?? null,
      color: row.color ?? null,
      tamanio: row.tamanio ?? null,
      stock_total: row.stock_total ?? null,
      stock_disponible: row.stock_disponible ?? null,
      id_categoria: row.id_categoria ?? null,
      categoria_nombre: categoriaRow?.nombre ?? null,
    });
  });
  return formatted;
};

const getArticuloCantidadesByEvento = async (eventoId) => {
  const { data, error } = await supabase
    .from('lista_evento')
    .select('id_articulo, cantidad')
    .eq('id_evento', eventoId)
    .not('id_articulo', 'is', null);
  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener los artículos del evento.');
  }
  const map = new Map();
  (data || []).forEach((row) => {
    const id = Number(row?.id_articulo);
    const cantidad = Number(row?.cantidad) || 0;
    if (!id || cantidad <= 0) return;
    map.set(id, (map.get(id) || 0) + cantidad);
  });
  return map;
};

const adjustArticuloStockForEvento = async (eventoId, direction) => {
  if (!direction) return;
  const cantidadesMap = await getArticuloCantidadesByEvento(eventoId);
  if (!cantidadesMap.size) return;

  const articulosMap = await fetchArticulosMap(Array.from(cantidadesMap.keys()));
  const updates = [];

  cantidadesMap.forEach((cantidad, idArticulo) => {
    const articulo = articulosMap.get(idArticulo);
    if (!articulo) {
      throw new Error(`Artículo ${idArticulo} no encontrado`);
    }
    const disponible = Number(articulo.stock_disponible ?? 0);
    const total = Number(articulo.stock_total ?? NaN);
    const delta = direction * cantidad;
    const nuevoDisponible = disponible + delta;
    if (direction < 0 && nuevoDisponible < 0) {
      throw new Error(
        `No hay stock suficiente para el artículo ${articulo.nombre ?? idArticulo}`,
      );
    }
    const finalDisponible =
      direction > 0 && Number.isFinite(total) ? Math.min(nuevoDisponible, total) : nuevoDisponible;
    updates.push({ id_articulo: articulo.id_articulo, stock_disponible: finalDisponible });
  });

  for (const upd of updates) {
    const { error } = await supabase
      .from('Articulo')
      .update({ stock_disponible: upd.stock_disponible })
      .eq('id_articulo', upd.id_articulo);
    if (error) {
      throw fromSupabaseError(error, 'No se pudo actualizar el stock de artículos.');
    }
  }
};

const fetchEstadoId = async (nombre) => {
  const { data, error } = await supabase
    .from('estado')
    .select('id_estado')
    .eq('estado', nombre)
    .single();
  if (error || !data) {
    throw new Error('Estado no encontrado');
  }
  return data.id_estado;
};

const getEventos = async (page = 1, estado = null) => {
  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE - 1;

  let query = supabase
    .from('evento')
    .select('*', { count: 'exact' })
    .range(start, end)
    .order('fecha_creacion', { ascending: false });

  if (estado) {
    const idEstado = Number.isNaN(+estado) ? await fetchEstadoId(estado) : +estado;
    query = query.eq('id_estado', idEstado);
  }

  const { data, error, count } = await query;
  if (error) throw fromSupabaseError(error, 'Error al obtener eventos');

  const eventos = data || [];
  const perfilIds = eventos.map((row) => row.id_perfil);
  const estadoIds = eventos.map((row) => row.id_estado);
  const [perfilMap, estadoMap] = await Promise.all([
    fetchPerfilesMap(perfilIds),
    fetchEstadosMap(estadoIds),
  ]);

  return {
    data: eventos.map((row) => {
      const perfilRow = perfilMap.get(Number(row.id_perfil));
      const estadoNombre = estadoMap.get(Number(row.id_estado));
      return {
        id: row.id_evento,
        nombre: perfilRow?.nombre ?? null,
        fecha_entrega: row.fecha_entrega,
        total_final: row.total_final,
        observaciones: row.observaciones,
        estado: estadoNombre ?? null,
      };
    }),
    totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
    currentPage: page,
  };
};

const getEventoById = async (id) => {
  const { data, error } = await supabase.from('evento').select('*').eq('id_evento', id).single();

  if (error || !data) throw new Error('Evento no encontrado');

  const enriched = await attachPerfilAndEstado(data);

  return {
    id: enriched.id_evento,
    nombre: enriched?.perfil?.nombre ?? null,
    fecha_entrega: enriched.fecha_entrega,
    total_final: enriched.total_final,
    observaciones: enriched.observaciones,
    estado: enriched?.estado?.estado ?? null,
    perfil: enriched.perfil,
  };
};

const getEventoByIdFull = async (id) => {
  const { data, error } = await supabase.from('evento').select('*').eq('id_evento', id).single();

  if (error || !data) throw new Error('Evento no encontrado');

  const baseEvento = await attachPerfilAndEstado(data);

  const { data: detalles, error: detallesErr } = await supabase
    .from('lista_evento')
    .select('*')
    .eq('id_evento', id);

  if (detallesErr) {
    throw fromSupabaseError(detallesErr, 'Error al obtener la lista del evento');
  }

  const lista = detalles || [];
  const tortaIds = lista.map((det) => det.id_torta);
  const bandejaIds = lista.map((det) => det.id_bandeja);
  const articuloIds = lista.map((det) => det.id_articulo);

  const [tortaMap, bandejaMap, articuloMap] = await Promise.all([
    fetchTortasMap(tortaIds),
    fetchBandejasMap(bandejaIds),
    fetchArticulosMap(articuloIds),
  ]);

  const listaEvento = lista.map((detalle) => ({
    ...detalle,
    torta: detalle.id_torta ? tortaMap.get(Number(detalle.id_torta)) || null : null,
    bandeja: detalle.id_bandeja ? bandejaMap.get(Number(detalle.id_bandeja)) || null : null,
    articulo: detalle.id_articulo ? articuloMap.get(Number(detalle.id_articulo)) || null : null,
  }));

  return {
    ...baseEvento,
    lista_evento: listaEvento,
  };
};

const calcularDetalles = async ({ tortas = [], bandejas = [], articulos = [] }) => {
  let total = 0;
  let totalItems = 0;
  const detalles = [];

  for (const item of tortas) {
    const { data, error } = await supabase
      .from('torta')
      .select('id_torta, precio')
      .eq('id_torta', item.id_torta)
      .single();
    if (error || !data) throw new Error('Torta no encontrada');

    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(data.precio) || 0;
    const subtotal = precio * cantidad;

    total += subtotal;
    totalItems += cantidad;

    detalles.push({
      id_torta: data.id_torta,
      cantidad,
      precio_unitario: precio,
    });
  }

  for (const item of bandejas) {
    const { data, error } = await supabase
      .from('bandeja')
      .select('id_bandeja, precio')
      .eq('id_bandeja', item.id_bandeja)
      .single();
    if (error || !data) throw new Error('Bandeja no encontrada');

    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(data.precio) || 0;
    const subtotal = precio * cantidad;

    total += subtotal;
    totalItems += cantidad;

    detalles.push({
      id_bandeja: data.id_bandeja,
      cantidad,
      precio_unitario: precio,
    });
  }

  for (const item of articulos) {
    const { data, error } = await supabase
      .from('Articulo')
      .select('id_articulo, precio_alquiler, stock_disponible')
      .eq('id_articulo', item.id_articulo)
      .single();
    if (error || !data) throw new Error('Artículo no encontrado');

    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(data.precio_alquiler) || 0;
    const stockDisponible = Number(data.stock_disponible ?? 0);
    if (cantidad > stockDisponible) {
      throw new Error(`Stock insuficiente para el artículo ${data.id_articulo}`);
    }
    const subtotal = precio * cantidad;

    total += subtotal;
    totalItems += cantidad;

    detalles.push({
      id_articulo: data.id_articulo,
      cantidad,
      precio_unitario: precio,
    });
  }

  return { total, totalItems, detalles };
};

const createEvento = async ({
  id_perfil,
  fecha_entrega,
  tipo_entrega,
  tortas = [],
  bandejas = [],
  articulos = [],
  observaciones = null,
  direccion_entrega = null,
}) => {
  if (!id_perfil || !fecha_entrega || !tipo_entrega) {
    throw new Error('Faltan datos del evento');
  }

  const idEstadoPendiente = await fetchEstadoId(ESTADO_PENDIENTE);

  const { total, totalItems, detalles } = await calcularDetalles({ tortas, bandejas, articulos });

  const performInsert = () =>
    supabase
      .from('evento')
      .insert({
        id_perfil,
        fecha_creacion: new Date().toISOString(),
        fecha_entrega,
        id_estado: idEstadoPendiente,
        tipo_entrega,
        total_items: totalItems,
        total_descuento: 0,
        total_final: total,
        observaciones,
        direccion_entrega,
      })
      .select()
      .single();

  let { data: eventoData, error: eventoError } = await performInsert();

  if (eventoError?.code === 'PGRST204') {
    await reloadSchemaCache();
    ({ data: eventoData, error: eventoError } = await performInsert());
  }

  if (eventoError) {
    throw fromSupabaseError(eventoError, 'No se pudo crear el evento.');
  }
  if (!eventoData) {
    throw new Error('No se recibió información del evento recién creado.');
  }

  if (detalles.length > 0) {
    const detallesConEvento = detalles.map((det) => ({ ...det, id_evento: eventoData.id_evento }));
    const { error: detError } = await supabase.from('lista_evento').insert(detallesConEvento);
    if (detError) {
      throw fromSupabaseError(detError, 'No se pudo crear la lista del evento.');
    }
  }

  return eventoData;
};

const updateEvento = async (id, datos) => {
  const evento = await getEventoById(id);
  if (String(evento.estado || '').toLowerCase().trim() !== ESTADO_PENDIENTE) {
    throw new Error('Solo se puede editar un evento pendiente');
  }

  const {
    id_perfil,
    fecha_entrega,
    tipo_entrega,
    tortas = [],
    bandejas = [],
    articulos = [],
    observaciones = null,
    direccion_entrega = null,
  } = datos || {};

  if (!id_perfil || !fecha_entrega || !tipo_entrega) {
    throw new Error('Faltan datos del evento');
  }

  const { error: detDelErr } = await supabase
    .from('lista_evento')
    .delete()
    .eq('id_evento', id);

  if (detDelErr) {
    throw fromSupabaseError(detDelErr, 'No se pudo limpiar la lista del evento.');
  }

  const { total, totalItems, detalles } = await calcularDetalles({ tortas, bandejas, articulos });

  const { data: eventoActualizado, error: updateError } = await supabase
    .from('evento')
    .update({
      id_perfil,
      fecha_entrega,
      tipo_entrega,
      total_items: totalItems,
      total_descuento: 0,
      total_final: total,
      observaciones,
      direccion_entrega,
      update_at: new Date().toISOString(),
    })
    .eq('id_evento', id)
    .select()
    .single();

  if (updateError) {
    throw fromSupabaseError(updateError, 'No se pudo actualizar el evento.');
  }
  if (!eventoActualizado) {
    throw new Error('No se recibió información actualizada del evento.');
  }

  if (detalles.length > 0) {
    const { error: detError } = await supabase
      .from('lista_evento')
      .insert(detalles.map((det) => ({ ...det, id_evento: id })));
    if (detError) {
      throw fromSupabaseError(detError, 'No se pudo actualizar la lista del evento.');
    }
  }

  return eventoActualizado;
};

const updateEstadoEvento = async (id, idEstadoNuevo) => {
  const mapLabelToId = { pendiente: 1, confirmado: 2, cerrado: 3, cancelado: 4 };
  const transiciones = {
    1: [2, 4],
    2: [3, 4],
    3: [],
    4: [],
  };

  const evento = await getEventoById(id);
  const estadoActualStr = String(evento?.estado || '').toLowerCase().trim();
  const idEstadoActual = mapLabelToId[estadoActualStr];

  if (!idEstadoActual) {
    throw new Error('Estado actual inválido en el evento');
  }
  if (!transiciones[idEstadoActual]?.includes(idEstadoNuevo)) {
    throw new Error('Transición de estado no permitida');
  }

  const idConfirmado = mapLabelToId.confirmado;
  const idCerrado = mapLabelToId.cerrado;
  const idCancelado = mapLabelToId.cancelado;
  const shouldSubtract = idEstadoActual === mapLabelToId.pendiente && idEstadoNuevo === idConfirmado;
  const shouldReturn =
    idEstadoActual === idConfirmado && (idEstadoNuevo === idCerrado || idEstadoNuevo === idCancelado);

  if (shouldSubtract) {
    await adjustArticuloStockForEvento(id, -1);
  } else if (shouldReturn) {
    await adjustArticuloStockForEvento(id, 1);
  }

  const { data, error } = await supabase
    .from('evento')
    .update({
      id_estado: idEstadoNuevo,
      update_at: new Date().toISOString(),
    })
    .eq('id_evento', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error('Error al actualizar estado del evento');
  }

  return data;
};

const deleteEvento = async (id) => {
  const evento = await getEventoById(id);
  const estadoActual = String(evento?.estado || '').toLowerCase().trim();
  if (estadoActual !== ESTADO_PENDIENTE) {
    throw new Error('Solo se puede eliminar un evento pendiente');
  }

  const { error: detDelErr } = await supabase
    .from('lista_evento')
    .delete()
    .eq('id_evento', id);

  if (detDelErr) {
    throw new Error('No se pudieron eliminar los elementos del evento.');
  }

  const { data: eventoEliminado, error: delErr } = await supabase
    .from('evento')
    .delete()
    .eq('id_evento', id)
    .select()
    .single();

  if (delErr || !eventoEliminado) {
    throw new Error('Error al eliminar el evento');
  }

  return eventoEliminado;
};

module.exports = {
  getEventos,
  getEventoById,
  getEventoByIdFull,
  createEvento,
  updateEvento,
  updateEstadoEvento,
  deleteEvento,
};
