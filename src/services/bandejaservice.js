// src/services/bandejaservice.js
const supabase = require('../config/supabase');

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
        console.log("→ TORTAS A INSERTAR:", tortasEnBandeja);
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

module.exports = {
    createBandeja,
    getTortasParaBandejas,
};