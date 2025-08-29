const  supabase  = require('../config/supabase'); 
const { fromSupabaseError } = require('../utils/errors');

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

  // Usa dinámicamente el bucket que llega por parámetro
  const prefix = `/storage/v1/object/public/${bucket_name}/`;
  const pathParts = imageUrl.split(prefix);

  if (pathParts.length < 2) return;

  const filePath = pathParts[1];
  if (!filePath) return;

  const { error } = await supabase.storage
    .from(bucket_name)
    .remove([filePath]);

  if (error) {
    throw fromSupabaseError(error, 'Error al eliminar la imagen del bucket');
  }
};

module.exports = {
  uploadImage,
    deleteImage,
}