const supabase = require('../config/supabase');
const {AppError, fromSupabaseError, assertFound} = require('../utils/errors');

const getTortas = async (page = 1, search = '') => {
  const itemsPerPage = 8;
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage - 1;

  let query = supabase
    .from('torta')
    .select('*', { count: 'exact' })
    .range(start, end);

  if (search) {
    query = query.ilike('nombre', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error('Error al obtener tortas');
  }

  return {
    data: data || [],
    totalPages: Math.ceil((count || 0) / itemsPerPage),
    currentPage: page,
  };
};

const createTorta = async ({ nombre, precio, tamanio, imagen }) => {
  if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
    throw new Error('El campo Nombre es requerido.');
  }
  if (precio === undefined || precio === null || isNaN(Number(precio)) || Number(precio) <= 0) {
    throw new Error('El campo Precio debe ser un número válido y mayor a cero.');
  }
  if (!tamanio || typeof tamanio !== 'string' || tamanio.trim() === '') {
    throw new Error('El campo Tamaño es requerido.');
  }
  const NOMBRE_TABLA_CORRECTO = 'torta';

  const { data, error } = await supabase
    .from(NOMBRE_TABLA_CORRECTO) 
    .insert({
      nombre: nombre.trim(), 
      precio: Number(precio), 
      tamanio: tamanio.trim(), 
      imagen: imagen 
    })
    .select(); 
  if (error) {
    throw new Error(`Error al intentar guardar la torta en la base de datos: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('La torta fue creada pero no se pudo recuperar la información.');
  }
  return data[0]; // Devuelve el primer (y único) elemento del array de datos
};

const uploadImage = async (file) => {
  if (!file) {
    return null;
  }

  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `tortas-imagenes/${fileName}`;

  const { error } = await supabase.storage
    .from('tortas-imagenes')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
    });

  if (error) {
    throw new Error('Error al subir imagen');
  }

  const { data } = supabase.storage
    .from('tortas-imagenes')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

// función para eliminar una imagen del bucket
const deleteImage = async (imageUrl) => {
  if (!imageUrl) return;

  const pathParts = imageUrl.split('/storage/v1/object/public/tortas-imagenes/');
  if (pathParts.length < 2) return; // Si la URL no tiene el formato esperado, salir

  const filePath = pathParts[1]; 
  if (!filePath) return;

  const { error } = await supabase.storage
    .from('tortas-imagenes')
    .remove([filePath]);

  if (error) {
    console.error('Error al eliminar la imagen:', error);
    throw fromSupabaseError(error, 'Error al eliminar la imagen anterior');
  }
};

// función para actualizar una torta
const updateTorta = async (id, { nombre, precio, tamanio, imagen, existingImage }) => {
  if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
    throw new Error('El campo Nombre es requerido.');
  }
  if (precio === undefined || precio === null || isNaN(Number(precio)) || Number(precio) <= 0) {
    throw new Error('El campo Precio debe ser un número válido y mayor a cero.');
  }
  if (!tamanio || typeof tamanio !== 'string' || tamanio.trim() === '') {
    throw new Error('El campo Tamaño es requerido.');
  }

  let newImageUrl = existingImage; // Mantener la imagen existente por defecto

  // Si se proporciona una nueva imagen, subirla y eliminar la anterior
  if (imagen) {
    // Subir la nueva imagen
    newImageUrl = await uploadImage(imagen);
    
    // Eliminar la imagen anterior si existe y es diferente
    if (existingImage && existingImage !== newImageUrl) {
      console.log('Eliminando imagen anterior:', existingImage);
      await deleteImage(existingImage);
      console.log('Imagen anterior eliminada con éxito');
    }
  }
  const { data, error } = await supabase
    .from('torta')
    .update({
      nombre: nombre.trim(),
      precio: Number(precio),
      tamanio: tamanio.trim(),
      imagen: newImageUrl,
    })
    .eq('id_torta', id)
    .select();

  if (error) {
    throw new Error(`Error al intentar actualizar la torta: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('La torta fue actualizada pero no se pudo recuperar la información.');
  }

  return data[0];
};

const deleteTorta = async (id) => {
  // Check friendly usage in related tables
  const { count: recCount, error: recErr } = await supabase
    .from('receta')
    .select('*', { count: 'exact', head: true })
    .eq('id_torta', id);
  if (recErr) throw fromSupabaseError(recErr, 'No se pudo verificar el uso de la torta en recetas.');
  if ((recCount ?? 0) > 0) {
    throw AppError.conflict(`No se puede eliminar: está asociada a ${recCount} receta(s).`);
  }

  const { count: banCount, error: banErr } = await supabase
    .from('bandeja_tortas')
    .select('*', { count: 'exact', head: true })
    .eq('id_torta', id);
  if (banErr) throw fromSupabaseError(banErr, 'No se pudo verificar el uso de la torta en bandejas.');
  if ((banCount ?? 0) > 0) {
    throw AppError.conflict(`No se puede eliminar: está incluida en ${banCount} bandeja(s).`);
  }

  const { count: pedCount, error: pedErr } = await supabase
    .from('pedido_detalles')
    .select('*', { count: 'exact', head: true })
    .eq('id_torta', id);
  if (pedErr) throw fromSupabaseError(pedErr, 'No se pudo verificar el uso de la torta en pedidos.');
  if ((pedCount ?? 0) > 0) {
    throw AppError.conflict(`No se puede eliminar: está utilizada en ${pedCount} pedido(s).`);
  }

  const { data: torta, error: fetchError } = await supabase
    .from('torta')
    .select('imagen')
    .eq('id_torta', id)
    .single();

  if (fetchError) throw fromSupabaseError(fetchError, 'No se pudo obtener la torta para eliminarla.');
  assertFound(torta, 'La torta no existe o ya fue eliminada.');

  if (torta.imagen) {
    await deleteImage(torta.imagen);
  }

  const { data, error: deleteError } = await supabase
    .from('torta')
    .delete()
    .eq('id_torta', id)
    .select('id_torta');

  if (deleteError)throw fromSupabaseError(deleteError, 'No se pudo eliminar la torta.');
  assertFound(data,'La torta no existe o ya fue eliminada.')
  return true;
};

module.exports = {
  getTortas,
  createTorta,
  updateTorta,
  deleteTorta,
  uploadImage,
};