const supabase = require('../config/supabase');
const storagedeleteImage = require('./storageService').deleteImage;

const getBandejas = async (page = 1, search = '') => {
  const itemsPerPage = 8;
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage - 1;

  // La consulta ahora incluye las tablas relacionadas
  let query = supabase
    .from('bandeja')
    .select(`
      *,
      bandeja_tortas (
        *,
        torta (
          nombre,
          tamanio
        )
      )
    `, { count: 'exact' }) // Se mantiene el count para la paginación
    .range(start, end);

  if (search) {
    query = query.ilike('nombre', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("Error al obtener bandejas con tortas:", error);
    throw new Error('Error al obtener bandejas');
  }

  return {
    data: data || [],
    totalPages: Math.ceil((count || 0) / itemsPerPage),
    currentPage: page,
  };
};


const getTortasParaBandejas = async () => {
    try {
        // Paso 1: Obtener todos los id_torta que tienen receta
        const { data: recetas, error: errorRecetas } = await supabase
            .from('receta')
            .select('id_torta');

        if (errorRecetas) {
            console.error('Error al obtener recetas:', errorRecetas);
            throw new Error(`Error al obtener recetas: ${errorRecetas.message}`);
        }
        const idsTortasConReceta = recetas.map(r => r.id_torta);
        if (idsTortasConReceta.length === 0) {
            return []; // Si no hay recetas, devolvemos un array vacío
        }
        // Paso 2: Obtener las tortas que tienen receta, con relaciones anidadas
        const { data: tortas, error: errorTortas } = await supabase
            .from('torta')
            .select(`
                id_torta,
                nombre,
                tamanio,
                receta (
                    id_receta,
                    porciones,
                    ingredientereceta (
                        cantidad,
                        unidadmedida,
                        materiaprima (
                            id_materiaprima,
                            nombre,
                            unidadmedida,
                            cantidad, 
                            preciototal
                        )
                    )
                )
            `)
            .in('id_torta', idsTortasConReceta);
        if (errorTortas) {
            console.error('Error al obtener tortas:', errorTortas);
            throw new Error(`Error al obtener tortas: ${errorTortas.message}`);
        }
        return tortas;
    } catch (err) {
        throw err;
    }
};

const createBandeja = async (bandejaData, tortasEnBandeja) => {
    try {
        // 1. Insertar en la tabla 'bandeja'
        const { data: bandeja, error: bandejaError } = await supabase
            .from('bandeja')
            .insert({
                nombre: bandejaData.nombre,
                precio: bandejaData.precio, // Puede ser null
                tamanio: bandejaData.tamanio,
                imagen: bandejaData.imagenUrl || null, // Recibe la URL de la imagen si se subió
            })
            .select(); // Usamos .select() para obtener la bandeja insertada, incluyendo su ID

        if (bandejaError) {
            throw new Error(`Error al crear la bandeja: ${bandejaError.message}`);
        }
        if (!bandeja || bandeja.length === 0) {
            throw new Error('No se pudo recuperar la bandeja recién creada después de la inserción.');
        }

        const id_bandeja_creada = bandeja[0].id_bandeja;
        // 2. Preparar datos para insertar en la tabla 'bandeja_tortas'
        const bandejaTortasInserts = tortasEnBandeja.map(torta => ({
            id_bandeja: id_bandeja_creada,
            id_torta: torta.id_torta,
            porciones: torta.porciones,
            precio: torta.precio, // Precio individual de la torta en esta bandeja
        }));

        // 3. Insertar en la tabla 'bandeja_tortas'
        const { error: bandejaTortasError } = await supabase
            .from('bandeja_tortas')
            .insert(bandejaTortasInserts);

        if (bandejaTortasError) {
            throw new Error(`Error al agregar tortas a la bandeja: ${bandejaTortasError.message}`);
        }

        return bandeja[0]; // Retorna la bandeja creada con su ID y demás datos
    } catch (err) {
        console.error('Error en createBandejaInDB:', err.message);
        throw err;
    }
};

// función para actualizar una bandeja
const updateBandeja = async ({ id_bandeja, nombre, precio, tamanio, imagenUrl, tortas }) => {

  const { error: updateError } = await supabase
    .from('bandeja')
    .update({
      nombre,
      precio,
      tamanio,
      imagen: imagenUrl,
    })
    .eq('id_bandeja', id_bandeja);

  if (updateError) {
    throw new Error(`Error al actualizar bandeja: ${updateError.message}`);
  }

  const { error: deleteError } = await supabase
    .from('bandeja_tortas')
    .delete()
    .eq('id_bandeja', id_bandeja);

  if (deleteError) {
    throw new Error(`Error al limpiar bandeja_tortas: ${deleteError.message}`);
  }

  if (tortas.length > 0) {
    const inserts = tortas.map(t => ({
      id_bandeja: id_bandeja,
      id_torta: t.id_torta,
      porciones: t.porciones,
      precio: t.precio,
    }));

    const { error: insertError } = await supabase
      .from('bandeja_tortas')
      .insert(inserts);

    if (insertError) {
      throw new Error(`Error al insertar nuevas tortas: ${insertError.message}`);
    }
  }

  return {
    id_bandeja,
    nombre,
    precio,
    tamanio,
    imagen: imagenUrl,
    tortas
  };
};

//obtener la URL de la imagen vieja
const getBandejaImageUrl = async (bandejaId) => {
    const { data, error } = await supabase
        .from('bandeja')
        .select('imagen')
        .eq('id_bandeja', bandejaId)
        .single();

    if (error) return null;
    return data ? data.imagen : null;
};

const deleteBandeja = async (id) => {
  const { data: bandeja, error: fetchError } = await supabase
    .from('bandeja')
    .select('imagen')
    .eq('id_bandeja', id)
    .single();

  if (fetchError) {
    throw new Error(`Error al obtener la bandeja: ${fetchError.message}`);
  }

  if (!bandeja) {
    throw new Error('Bandeja no encontrada.');
  }

  const { error: deleteTortasError } = await supabase
    .from('bandeja_tortas')
    .delete()
    .eq('id_bandeja', id);

  if (deleteTortasError) {
    throw new Error(`Error al eliminar las tortas de la bandeja: ${deleteTortasError.message}`);
  }

  if (bandeja.imagen) {
    await storagedeleteImage(bandeja.imagen, 'bandejas-imagen');
  }

  const { error: deleteBandejaError } = await supabase
    .from('bandeja')
    .delete()
    .eq('id_bandeja', id);

  if (deleteBandejaError) {
    throw new Error(`Error al eliminar la bandeja: ${deleteBandejaError.message}`);
  }

  return true;
};

module.exports = {
    getBandejas,
    createBandeja,
    getTortasParaBandejas,
    updateBandeja,
    getBandejaImageUrl,
    deleteBandeja
};