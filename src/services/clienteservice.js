const supabase = require('../config/supabase');

const getClientes = async ({ activo = null, page = 1, pageSize = 10, search = '' }) => {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let query = supabase
    .from('cliente')
    .select('*', { count: 'exact' })
    .range(start, end);

  if (activo !== null) {
    query = query.eq('activo', activo);
  }

  if (search) {
    query = query.ilike('nombre', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error('Error al obtener clientes');
  }

  return {
    data: data || [],
    totalPages: Math.ceil((count || 0) / pageSize),
    currentPage: page,
  };
};

module.exports = {
  getClientes,
};