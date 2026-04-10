import { supabase } from './supabase';

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const fileExt = uri.split('.').pop() ?? 'jpg';
  const filePath = `${userId}/avatar.${fileExt}`;

  const response = await fetch(uri);
  const blob = await response.blob();
  const arrayBuffer = await blobToArrayBuffer(blob);

  const { error } = await supabase.storage.from('avatars').upload(filePath, arrayBuffer, {
    contentType: blob.type || `image/${fileExt}`,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  // Append timestamp to bust cache on avatar updates
  return `${data.publicUrl}?t=${Date.now()}`;
}
