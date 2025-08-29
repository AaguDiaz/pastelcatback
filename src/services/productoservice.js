const supabase = require('../config/supabase');

const getProductos = async ({ tipo, page = 1, pageSize = 6, search = '' }) => {
  if (!tipo) {
    throw new Error('Tipo de producto requerido');
  }
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let table;
  switch (tipo) {
    case 'torta':
      table = 'torta';
      break;
    case 'bandeja':
      table = 'bandeja';
      break;
    default:
      throw new Error('Tipo de producto inválido');
  }

  let query = supabase
    .from(table)
    .select('*', { count: 'exact' })
    .range(start, end);

  if (search) {
    query = query.ilike('nombre', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error('Error al obtener productos');
  }


  return {
    data: data || [],
    totalPages: Math.ceil((count || 0) / pageSize),
    currentPage: page,
  };
};

module.exports = {
  getProductos,
};