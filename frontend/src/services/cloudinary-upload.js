/**
 * Direct upload a single file to Cloudinary using unsigned preset.
 * Used for auction photos so the browser uploads to Cloudinary without going through our backend.
 * @param {File} file - The image file to upload
 * @param {string} cloudName - Cloudinary cloud name
 * @param {string} uploadPreset - Unsigned upload preset name (create in Cloudinary dashboard)
 * @param {string} [folder] - Optional folder (can also be set in preset)
 * @returns {Promise<string>} - Resolves with secure_url of the uploaded image
 */
export async function uploadFileToCloudinary(file, cloudName, uploadPreset, folder = 'auction_photos') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  if (folder) formData.append('folder', folder);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Upload failed: ${response.status}`);
  }

  const data = await response.json();
  return data.secure_url;
}

const UPLOAD_CONCURRENCY = 5;

/**
 * Upload multiple files to Cloudinary in parallel batches.
 * @param {File[]} files - Array of image files
 * @param {string} cloudName - Cloudinary cloud name
 * @param {string} uploadPreset - Unsigned upload preset name
 * @returns {Promise<string[]>} - Array of secure_urls in same order as files
 */
export async function uploadFilesInBatches(files, cloudName, uploadPreset) {
  const urls = [];
  for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
    const batch = files.slice(i, i + UPLOAD_CONCURRENCY);
    const batchUrls = await Promise.all(
      batch.map((file) => uploadFileToCloudinary(file, cloudName, uploadPreset))
    );
    urls.push(...batchUrls);
  }
  return urls;
}
