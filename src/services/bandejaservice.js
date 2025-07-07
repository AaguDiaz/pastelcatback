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

module.exports = {
    getTortasParaBandejas,
};