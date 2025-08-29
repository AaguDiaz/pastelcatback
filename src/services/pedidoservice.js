const supabase = require('../config/supabase');
const { AppError, fromSupabaseError, assertFound } = require('../utils/errors');

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

const getPedidos = async (page = 1, estado = null) => {
  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE - 1;

  let query = supabase
    .from('pedido')
    .select(
      `
      id,
      fecha_entrega,
      total_final,
      observaciones,
      cliente:cliente ( nombre ),
      estado:estado ( estado )
      `,
      { count: 'exact' }
    )
    .range(start, end)
    .order('fecha_creacion', { ascending: false });

  if (estado) {
    const idEstado = isNaN(+estado) ? await fetchEstadoId(estado) : +estado;
    query = query.eq('id_estado', idEstado);
  }

  const { data, error, count } = await query;
  if (error) throw new Error('Error al obtener pedidos');

  // aplanar: poner "nombre" arriba, no anidado bajo cliente
  const items = (data || []).map((row) => ({
    id: row.id,
    nombre: row?.cliente?.nombre ?? null,
    fecha_entrega: row.fecha_entrega,
    total_final: row.total_final,
    observaciones: row.observaciones,
    estado: row?.estado?.estado ?? null,
  }));

  return {
    data: items,
    totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
    currentPage: page,
  };
};

const getPedidoById = async (id) => {
  const { data, error } = await supabase
    .from('pedido')
    .select(
      `
      id,
      fecha_entrega,
      total_final,
      observaciones,
      cliente:cliente ( nombre ),
      estado:estado ( estado )
      `
    )
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Pedido no encontrado');

  return {
    id: data.id,
    nombre: data?.cliente?.nombre ?? null,
    fecha_entrega: data.fecha_entrega,
    total_final: data.total_final,
    observaciones: data.observaciones,
    estado: data?.estado?.estado ?? null,
  };
};

const getPedidoByIdFull = async (id) => {
  const { data, error } = await supabase
    .from('pedido')
    .select(
      `
      *,
      estado:estado ( estado ),
      cliente:cliente ( nombre ),
      pedido_detalles ( *,
       torta:torta ( * ),
       bandeja:bandeja ( * )
        )
      `
    )
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Pedido no encontrado');

  return data;
};

const createPedido = async ({
  id_cliente,
  fecha_entrega,
  tipo_entrega,                 // varchar en la tabla
  tortas = [],
  bandejas = [],
  observaciones = null,
  direccion_entrega = null,
}) => {
  if (!id_cliente || !fecha_entrega || !tipo_entrega) {
    throw new Error('Faltan datos del pedido');
  }

  const idEstadoPendiente = await fetchEstadoId(ESTADO_PENDIENTE);

  let total = 0;
  let totalItems = 0;
  const detalles = [];

  // tortas
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

  // bandejas
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

  // insertar pedido
  const { data: pedidoData, error: pedidoError } = await supabase
    .from('pedido')
    .insert({
      id_cliente,
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

  if (pedidoError || !pedidoData) {
    throw new Error('Error al crear pedido');
  }

  for (const det of detalles) {
    det.id_pedido = pedidoData.id;       
  }

  const { error: detError } = await supabase
    .from('pedido_detalles')
    .insert(detalles);

  if (detError) {
    throw new Error('Error al crear detalle del pedido');
  }

  return pedidoData;
};

const updatePedido = async (id, datos) => {
  const pedido = await getPedidoById(id);
  if (pedido.estado !== ESTADO_PENDIENTE) {
    throw new Error('Solo se puede editar un pedido pendiente');
  }

  const {
    id_cliente,
    fecha_entrega,
    tipo_entrega,            
    tortas = [],
    bandejas = [],
    observaciones = null,
    direccion_entrega = null,
  } = datos;

  if (!id_cliente || !fecha_entrega || !tipo_entrega) {
    throw new Error('Faltan datos del pedido');
  }

  const { error: detDelErr } = await supabase
    .from('pedido_detalles')
    .delete()
    .eq('id_pedido', id);

  if (detDelErr) {
    throw fromSupabaseError(detDelErr, 'No se pudieron eliminar los detalles del pedido.');
  }
  let total = 0;
  let totalItems = 0;
  const detalles = [];

  // tortas
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

  // bandejas
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

  const { data: pedidoActualizado, error: updateError } = await supabase
    .from('pedido')
    .update({
      id_cliente,
      fecha_entrega,
      tipo_entrega,
      total_items: totalItems,
      total_descuento: 0,
      total_final: total,
      observaciones,
      direccion_entrega,
      update_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    throw new Error('Error al actualizar pedido');
  }

  if (detalles.length > 0) {
    const { error: detError } = await supabase
      .from('pedido_detalles')
      .insert(detalles.map(d => ({ ...d, id_pedido: id })));
    if (detError) throw new Error('Error al actualizar detalle del pedido');
  }

  return pedidoActualizado;
};

const updateEstado = async (id, idEstadoNuevo) => {
  const mapLabelToId = { pendiente: 1, confirmado: 2, cerrado: 3, cancelado: 4 };
  const transiciones = {
  1: [2, 4], // pendiente -> confirmado | cancelado
  2: [3, 4], // confirmado -> cerrado | cancelado
  3: [], // cerrado -> no permitido
  4: [], // cancelado -> no permitido
  };

  const pedido = await getPedidoById(id);
  const estadoActualStr =
  (pedido?.estado && typeof pedido.estado === 'object')
  ? pedido.estado.estado
  : pedido?.estado;
  const idEstadoActual = mapLabelToId[String(estadoActualStr || '').toLowerCase().trim()];

  if (!idEstadoActual) {
  throw new Error('Estado actual inválido en el pedido');
  }
  if (!transiciones[idEstadoActual]?.includes(idEstadoNuevo)) {
  throw new Error('Transición de estado no permitida');
  }

  const { data, error } = await supabase
  .from('pedido')
  .update({
  id_estado: idEstadoNuevo,
  update_at: new Date().toISOString(),
  })
  .eq('id', id)
  .select()
  .single();

  if (error || !data) {
  throw new Error('Error al actualizar estado');
  }

  return data;
};

const deletePedido = async (id) => {
  // Trae el pedido y valida estado actual
  const pedido = await getPedidoById(id);

  const estadoActual =
  (pedido?.estado && typeof pedido.estado === 'object')
  ? pedido.estado.estado
  : pedido?.estado;

  if (String(estadoActual || '').toLowerCase().trim() !== 'pendiente') {
    throw new Error('Solo se puede eliminar un pedido pendiente');
  }

  // Elimina los detalles relacionados primero
  const { error: detDelErr } = await supabase
  .from('pedido_detalles')
  .delete()
  .eq('id_pedido', id);

  if (detDelErr) {
    throw new Error('No se pudieron eliminar los detalles del pedido.');
  }

  // Elimina el pedido
  const { data: pedidoEliminado, error: delErr } = await supabase
  .from('pedido')
  .delete()
  .eq('id', id)
  .select()
  .single();

  if (delErr || !pedidoEliminado) {
    throw new Error('Error al eliminar el pedido');
  }

  return pedidoEliminado;
};

module.exports = {
  getPedidos,
  getPedidoById,
  getPedidoByIdFull,
  createPedido,
  updatePedido,
  updateEstado,
  deletePedido,
};

