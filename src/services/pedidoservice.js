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
    .select('id_pedido, fecha_pedido, fecha_entrega, total, estado:estado(estado)', { count: 'exact' })
    .range(start, end)
    .order('fecha_pedido', { ascending: false });

  if (estado) {
    query = query.eq('id_estado', estado);
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
    .select(`
      *,
      cliente:cliente(*),
      estado:estado(*),
      pedido_detalle(
        *,
        torta:torta(*),
        bandeja:bandeja(*)
      )
    `)
    .eq('id_pedido', id)
    .single();

  if (error || !data) {
    throw new Error('Pedido no encontrado');
  }

  return data;
};

const createPedido = async ({ id_cliente, fecha_entrega, id_tipo_entrega, tortas = [], bandejas = [], observaciones = null }) => {
  if (!id_cliente || !fecha_entrega || !id_tipo_entrega) {
    throw new Error('Faltan datos del pedido');
  }

  const idEstadoPendiente = await fetchEstadoId(ESTADO_PENDIENTE);

  let total = 0;
  const detalles = [];

  for (const item of tortas) {
    const { data, error } = await supabase
      .from('torta')
      .select('id_torta, precio')
      .eq('id_torta', item.id_torta)
      .single();
    if (error || !data) {
      throw new Error('Torta no encontrada');
    }
    const subtotal = data.precio * item.cantidad;
    total += subtotal;
    detalles.push({ id_torta: data.id_torta, cantidad: item.cantidad, precio_unitario: data.precio, subtotal });
  }

  for (const item of bandejas) {
    const { data, error } = await supabase
      .from('bandeja')
      .select('id_bandeja, precio')
      .eq('id_bandeja', item.id_bandeja)
      .single();
    if (error || !data) {
      throw new Error('Bandeja no encontrada');
    }
    const subtotal = data.precio * item.cantidad;
    total += subtotal;
    detalles.push({ id_bandeja: data.id_bandeja, cantidad: item.cantidad, precio_unitario: data.precio, subtotal });
  }

  const { data: pedidoData, error: pedidoError } = await supabase
    .from('pedido')
    .insert({
      id_cliente,
      fecha_pedido: new Date().toISOString(),
      fecha_entrega,
      id_estado: idEstadoPendiente,
      id_tipo_entrega,
      total,
      observaciones,
    })
    .select()
    .single();

  if (pedidoError || !pedidoData) {
    throw new Error('Error al crear pedido');
  }

  for (const det of detalles) {
    det.id_pedido = pedidoData.id_pedido;
  }

  const { error: detError } = await supabase
    .from('pedido_detalle')
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

  const { id_cliente, fecha_entrega, id_tipo_entrega, tortas = [], bandejas = [], observaciones = null } = datos;

  if (!id_cliente || !fecha_entrega || !id_tipo_entrega) {
    throw new Error('Faltan datos del pedido');
  }

  await supabase.from('pedido_detalle').delete().eq('id_pedido', id);

  let total = 0;
  const detalles = [];

  for (const item of tortas) {
    const { data, error } = await supabase
      .from('torta')
      .select('id_torta, precio')
      .eq('id_torta', item.id_torta)
      .single();
    if (error || !data) {
      throw new Error('Torta no encontrada');
    }
    const subtotal = data.precio * item.cantidad;
    total += subtotal;
    detalles.push({ id_pedido: id, id_torta: data.id_torta, cantidad: item.cantidad, precio_unitario: data.precio, subtotal });
  }

  for (const item of bandejas) {
    const { data, error } = await supabase
      .from('bandeja')
      .select('id_bandeja, precio')
      .eq('id_bandeja', item.id_bandeja)
      .single();
    if (error || !data) {
      throw new Error('Bandeja no encontrada');
    }
    const subtotal = data.precio * item.cantidad;
    total += subtotal;
    detalles.push({ id_pedido: id, id_bandeja: data.id_bandeja, cantidad: item.cantidad, precio_unitario: data.precio, subtotal });
  }

  const { data: pedidoActualizado, error: updateError } = await supabase
    .from('pedido')
    .update({
      id_cliente,
      fecha_entrega,
      id_tipo_entrega,
      total,
      observaciones,
    })
    .eq('id_pedido', id)
    .select()
    .single();

  if (updateError) {
    throw new Error('Error al actualizar pedido');
  }

  if (detalles.length > 0) {
    const { error: detError } = await supabase.from('pedido_detalle').insert(detalles);
    if (detError) {
      throw new Error('Error al actualizar detalle del pedido');
    }
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
    .eq('id_pedido', id)
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

