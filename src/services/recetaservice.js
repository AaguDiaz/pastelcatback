const supabase = require('../config/supabase')

// Obtener tortas (solo id y nombre)
const obtenerTortas = async () => {
  const { data: tortas, error: errTortas } = await supabase
    .from('torta')
    .select('id_torta, nombre, tamanio');

  const { data: recetas, error: errRecetas } = await supabase
    .from('receta')
    .select('id_torta');

  if (errTortas || errRecetas) throw errTortas || errRecetas;

  const tortasConReceta = new Set(recetas.map(r => r.id_torta));

  const tortasSinReceta = tortas
    .filter(t => !tortasConReceta.has(t.id_torta))
    .map(t => ({
      id_torta: t.id_torta,
      nombre: `${t.nombre} ${t.tamanio}`, // ← Nombre + Tamaño
    }));

  return tortasSinReceta;
};

// Obtener ingredientes/materias primas (solo id y nombre)
async function obtenerMateriasPrimas() {
  const { data, error } = await supabase
    .from('materiaprima')
    .select('id_materiaprima, nombre')

  if (error) throw error
  return data
}

const createReceta = async ({ id_torta, porciones, ingredientes }) => {
  // 1. Crear receta
  const { data: recetaInsertada, error: errorReceta } = await supabase
    .from('receta')
    .insert([{ id_torta, porciones }])
    .select()
    .single();

  if (errorReceta) throw errorReceta;

  const id_receta = recetaInsertada.id_receta;

  // 2. Crear registros en ingredientereceta
  const ingredientesPreparados = ingredientes.map((ing) => ({
    cantidad: ing.cantidad,
    unidadmedida: ing.unidadmedida,
    id_receta,
    id_materiaprima: ing.id_materiaprima,
  }));

  const { error: errorIngredientes } = await supabase
    .from('ingredientereceta')
    .insert(ingredientesPreparados);

  if (errorIngredientes) throw errorIngredientes;

  return recetaInsertada;
};

const getRecetas = async () => {
  const { data, error } = await supabase
    .from('receta')
    .select(`
      id_receta,
      id_torta,
      porciones,
      torta (
        id_torta,
        nombre,
        tamanio
      )
    `);

  if (error) throw error;

  // Formateamos los datos para que coincidan con lo que el frontend espera
  const recetasFormateadas = data.map(receta => ({
    id_receta: receta.id_receta,
    torta: {
      id_torta: receta.id_torta, // Usamos el id_torta de la tabla receta
      nombre: receta.torta.nombre,
      tamanio: receta.torta.tamanio,
    },
    porciones: receta.porciones,
  }));
  
  return recetasFormateadas;
};

const getIngredientesReceta = async (id_receta) => {
  const { data, error } = await supabase
    .from('ingredientereceta')
    .select(`
      cantidad,
      unidadmedida,
      materiaprima (
        id_materiaprima,
        nombre,
        unidadmedida,
        cantidad,
        preciototal
      )
    `)
    .eq('id_receta', id_receta);

  if (error) throw error;

  // Formateamos para que coincida con la tabla del frontend
  const ingredientesFormateados = data.map(ing => ({
    id: ing.materiaprima.id_materiaprima,
    ingrediente: ing.materiaprima.nombre,
    cantidad: ing.cantidad,
    unidad: ing.unidadmedida,
    precio: ing.materiaprima.preciototal,
    unidadmedida: ing.materiaprima.unidadmedida,
    cantidadMateriaPrima: ing.materiaprima.cantidad,
  }));

  return ingredientesFormateados;
};

const getRecetaCompletaPorTorta = async (id_torta) => {
  // 1. Encontrar la receta y sus porciones usando el id_torta
  const { data: receta, error: errorReceta } = await supabase
    .from('receta')
    .select('id_receta, porciones')
    .eq('id_torta', id_torta)
    .single(); // Esperamos una sola receta por torta

  if (errorReceta) {
    if (errorReceta.code === 'PGRST116') { // Código de Supabase para "no se encontró una fila"
      throw new Error('No se encontró una receta para esta torta.');
    }
    throw errorReceta;
  }

  // 2. Usar la función ya existente para obtener los ingredientes
  const ingredientes = await getIngredientesReceta(receta.id_receta);

  // 3. Devolver un objeto combinado
  return {
    porciones: receta.porciones,
    ingredientes: ingredientes,
  };
};

const updateReceta = async (id_receta, { porciones, ingredientes }) => {
  // 1. Actualizar los datos principales de la receta
  const { error: errorUpdate } = await supabase
    .from('receta')
    .update({ porciones })
    .eq('id_receta', id_receta);

  if (errorUpdate) throw errorUpdate;

  // 2. Eliminar todos los ingredientes viejos de esa receta
  const { error: errorDelete } = await supabase
    .from('ingredientereceta')
    .delete()
    .eq('id_receta', id_receta);

  if (errorDelete) throw errorDelete;

  // 3. Insertar la nueva lista de ingredientes
  const ingredientesPreparados = ingredientes.map((ing) => ({
    cantidad: ing.cantidad,
    unidadmedida: ing.unidadmedida,
    id_receta,
    id_materiaprima: ing.id_materiaprima,
  }));
  
  const { error: errorInsert } = await supabase
    .from('ingredientereceta')
    .insert(ingredientesPreparados);

  if (errorInsert) throw errorInsert;

  return { mensaje: 'Receta actualizada correctamente' };
};

const deleteReceta = async (id_receta) => {
  // 1. Eliminar primero los ingredientes (por la foreign key)
  const { error: errorIngredientes } = await supabase
    .from('ingredientereceta')
    .delete()
    .eq('id_receta', id_receta);

  if (errorIngredientes) throw errorIngredientes;

  // 2. Eliminar la receta principal
  const { error: errorReceta } = await supabase
    .from('receta')
    .delete()
    .eq('id_receta', id_receta);

  if (errorReceta) throw errorReceta;

  return { mensaje: 'Receta eliminada correctamente' };
};

module.exports = {
  obtenerTortas,
  obtenerMateriasPrimas,
  createReceta,
    getRecetas,
    getIngredientesReceta,
    getRecetaCompletaPorTorta,
    updateReceta,
    deleteReceta,
}