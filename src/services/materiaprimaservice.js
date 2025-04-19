const supabase = require('../config/supabase');

const getMateriasPrimas = async (page = 1, search = '') => {
  const itemsPerPage = 10;
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage - 1;

  let query = supabase
    .from('materiaprima')
    .select('*', { count: 'exact' })
    .range(start, end);

  if (search) {
    query = query.ilike('Nombre', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error('Error al obtener materias primas');
  }

  return {
    data: data || [],
    totalPages: Math.ceil((count || 0) / itemsPerPage),
    currentPage: page,
  };
};

const createMateriaPrima = async ({ Nombre, UnidadMedida, Cantidad, PrecioTotal }) => {
  if (!Nombre || !UnidadMedida || Cantidad == null || PrecioTotal == null) {
    throw new Error('Faltan campos requeridos');
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .insert({ Nombre, UnidadMedida, Cantidad, PrecioTotal })
    .select();

  if (error) {
    throw new Error('Error al agregar materia prima');
  }

  return data[0];
};

const updateMateriaPrima = async (id, { Nombre, UnidadMedida, Cantidad, PrecioTotal }) => {
  if (!Nombre || !UnidadMedida || Cantidad == null || PrecioTotal == null) {
    throw new Error('Faltan campos requeridos');
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .update({ Nombre, UnidadMedida, Cantidad, PrecioTotal })
    .eq('id_materiaprima', id)
    .select();

  if (error || !data.length) {
    throw new Error('Error al editar materia prima');
  }

  return data[0];
};

const deleteMateriaPrima = async (id) => {
  const { error } = await supabase
    .from('materiaprima')
    .delete()
    .eq('id_materiaprima', id);

  if (error) {
    throw new Error('Error al eliminar materia prima');
  }
};

module.exports = {
  getMateriasPrimas,
  createMateriaPrima,
  updateMateriaPrima,
  deleteMateriaPrima,
};