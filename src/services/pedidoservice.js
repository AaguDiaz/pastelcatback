const supabase = require('../config/supabase');

const ITEMS_PER_PAGE = 15;
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
      // devolvemos total_final como total para que el front no cambie
      'id, fecha_creacion, fecha_entrega, total_final, estado:estado(estado)',
      { count: 'exact' }
    )
    .range(start, end)
    .order('fecha_creacion', { ascending: false });

  if (estado) {
    // permitir filtrar por id numérico o por nombre del estado
    const idEstado = isNaN(+estado) ? await fetchEstadoId(estado) : +estado;
    query = query.eq('id_estado', idEstado);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error('Error al obtener pedidos');
  }

  return {
    data: data || [],
    totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
    currentPage: page,
  };
};

const getPedidoById = async (id) => {
  const { data, error } = await supabase
    .from('pedido')
    .select('id, fecha_creacion, fecha_entrega, total_final, estado:estado(estado)', { count: 'exact' })
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error('Pedido no encontrado');
  }

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
  if (pedido.estado.estado !== ESTADO_PENDIENTE) {
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

  await supabase.from('pedido_detalles').delete().eq('id_pedido', id);

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

const updateEstado = async (id, nuevoEstado) => {
  const pedido = await getPedidoById(id);
  const estadoActual = pedido.estado.estado;

  const transiciones = {
    pendiente: ['confirmado', 'cancelado'],
    confirmado: ['entregado', 'cancelado'],
  };

  if (!transiciones[estadoActual] || !transiciones[estadoActual].includes(nuevoEstado)) {
    throw new Error('Transición de estado no permitida');
  }

  const idNuevoEstado = await fetchEstadoId(nuevoEstado);

  const { data, error } = await supabase
    .from('pedido')
    .update({ id_estado: idNuevoEstado })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error('Error al actualizar estado');
  }

  return data;
};

module.exports = {
  getPedidos,
  getPedidoById,
  createPedido,
  updatePedido,
  updateEstado,
};

