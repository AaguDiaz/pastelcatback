const  supabase  = require('../config/supabase'); // Asegúrate de que tu cliente de Supabase esté configurado y exportado aquí


const uploadImage = async (file,  bucket_name) => {
  if (!file) {
    return null;
  }

  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${bucket_name}/${fileName}`;

  const { error } = await supabase.storage
    .from(`${bucket_name}`)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
    });

  if (error) {
    throw new Error('Error al subir imagen');
  }

  const { data } = supabase.storage
    .from(`${bucket_name}`)
    .getPublicUrl(filePath);

  return data.publicUrl;
};

// Nueva función para eliminar una imagen del bucket
const deleteImage = async (imageUrl, bucket_name) => {
  if (!imageUrl) return;

  const pathParts = imageUrl.split('/storage/v1/object/public/tortas-imagenes/');
  if (pathParts.length < 2) return; // Si la URL no tiene el formato esperado, salir

  const filePath = pathParts[1]; 
  if (!filePath) return;

  const { error } = await supabase.storage
    .from(`${bucket_name}`)
    .remove([filePath]);

  if (error) {
    throw new Error(`Error al eliminar la imagen anterior: ${error.message}`);
  }
};

module.exports = {
  uploadImage,
    deleteImage,
}