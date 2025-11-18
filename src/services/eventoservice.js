const supabase = require('../config/supabase');
const { fromSupabaseError } = require('../utils/errors');

const ITEMS_PER_PAGE = 10;
const ESTADO_PENDIENTE = 'pendiente';

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

const mapEventoListRow = (row) => ({
  id: row.id_evento,
  nombre: row?.perfil?.nombre ?? null,
  fecha_entrega: row.fecha_entrega,
  total_final: row.total_final,
  observaciones: row.observaciones,
  estado: row?.estado?.estado ?? null,
});

const getEventos = async (page = 1, estado = null) => {
  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE - 1;

  let query = supabase
    .from('evento')
    .select(
      `
      id_evento,
      fecha_entrega,
      total_final,
      observaciones,
      perfil:perfil ( nombre ),
      estado:estado ( estado )
      `,
      { count: 'exact' }
    )
    .range(start, end)
    .order('fecha_creacion', { ascending: false });

  if (estado) {
    const idEstado = Number.isNaN(+estado) ? await fetchEstadoId(estado) : +estado;
    query = query.eq('id_estado', idEstado);
  }

  const { data, error, count } = await query;
  if (error) throw new Error('Error al obtener eventos');

  return {
    data: (data || []).map(mapEventoListRow),
    totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
    currentPage: page,
  };
};

const getEventoById = async (id) => {
  const { data, error } = await supabase
    .from('evento')
    .select(
      `
      id_evento,
      fecha_entrega,
      total_final,
      observaciones,
      perfil:perfil ( nombre ),
      estado:estado ( estado )
      `
    )
    .eq('id_evento', id)
    .single();

  if (error || !data) throw new Error('Evento no encontrado');

  return {
    id: data.id_evento,
    nombre: data?.perfil?.nombre ?? null,
    fecha_entrega: data.fecha_entrega,
    total_final: data.total_final,
    observaciones: data.observaciones,
    estado: data?.estado?.estado ?? null,
  };
};

const getEventoByIdFull = async (id) => {
  const { data, error } = await supabase
    .from('evento')
    .select(
      `
      *,
      estado:estado ( estado ),
      perfil:perfil ( nombre ),
      lista_evento (
        *,
        torta:torta ( * ),
        bandeja:bandeja ( * ),
        articulo:articulo ( * )
      )
      `
    )
    .eq('id_evento', id)
    .single();

  if (error || !data) throw new Error('Evento no encontrado');

  return data;
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
      .from('articulo')
      .select('id_articulo, precio_alquiler')
      .eq('id_articulo', item.id_articulo)
      .single();
    if (error || !data) throw new Error('Artículo no encontrado');

    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(data.precio_alquiler) || 0;
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

  const { data: eventoData, error: eventoError } = await supabase
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

  if (eventoError || !eventoData) {
    throw new Error('Error al crear evento');
  }

  if (detalles.length > 0) {
    const detallesConEvento = detalles.map((det) => ({ ...det, id_evento: eventoData.id_evento }));
    const { error: detError } = await supabase.from('lista_evento').insert(detallesConEvento);
    if (detError) {
      throw new Error('Error al crear la lista del evento');
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

  if (updateError || !eventoActualizado) {
    throw new Error('Error al actualizar evento');
  }

  if (detalles.length > 0) {
    const { error: detError } = await supabase
      .from('lista_evento')
      .insert(detalles.map((det) => ({ ...det, id_evento: id })));
    if (detError) {
      throw new Error('Error al actualizar la lista del evento');
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
