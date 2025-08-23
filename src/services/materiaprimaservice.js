const supabase = require('../config/supabase');
const { AppError, fromSupabaseError, assertFound } = require('../utils/errors');


const getMateriasPrimas = async (page = 1, search = '') => {
  const itemsPerPage = 10;
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage - 1;

  let query = supabase
    .from('materiaprima')
    .select('*', { count: 'exact' })
  if (search) {
    query = query.ilike('nombre', `%${search}%`);
  }

  query = query.range(start, end);

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

const createMateriaPrima = async ({ nombre, unidadmedida, cantidad, preciototal }) => {
  if (!nombre || !unidadmedida || cantidad == null || preciototal == null) {
    throw new Error('Faltan campos requeridos');
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .insert({ nombre, unidadmedida, cantidad, preciototal })
    .select();

  if (error) {
    throw new Error('Error al agregar materia prima');
  }

  return data[0];
};

const updateMateriaPrima = async (id, { nombre, unidadmedida, cantidad, preciototal }) => {
  if (!nombre || !unidadmedida || cantidad == null || preciototal == null) {
    throw new Error('Faltan campos requeridos');
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .update({ nombre, unidadmedida, cantidad, preciototal })
    .eq('id_materiaprima', id)
    .select();

  if (error || !data.length) {
    throw new Error('Error al editar materia prima');
  }

  return data[0];
};

const deleteMateriaPrima = async (id) => {
  // (Opcional) chequeo amistoso para un mensaje claro
  const { count, error: countErr } = await supabase
    .from('ingredientereceta') // ajustá a tu tabla pivote real
    .select('*', { count: 'exact', head: true })
    .eq('id_materiaprima', id);

  if (countErr) throw fromSupabaseError(countErr, 'No se pudo verificar el uso de la materia prima.');
  if ((count ?? 0) > 0) {
    throw AppError.conflict(`No se puede eliminar: está usada en ${count} receta(s).`);
  }

  const { data, error } = await supabase
    .from('materiaprima')
    .delete()
    .eq('id_materiaprima', id)
    .select('id_materiaprima');

  if (error) throw fromSupabaseError(error, 'No se pudo eliminar la materia prima.');
  assertFound(data, 'La materia prima no existe o ya fue eliminada.');
  // No retorna nada; el controller decide 204
};

module.exports = {
  getMateriasPrimas,
  createMateriaPrima,
  updateMateriaPrima, 
  deleteMateriaPrima,
};