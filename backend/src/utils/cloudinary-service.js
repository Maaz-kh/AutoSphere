const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class CloudinaryService {
  
  async uploadFile(fileBuffer, folder, publicId = null, options = {}) {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: folder,
        resource_type: 'auto', // Auto-detect: image, video, raw (for PDFs)
        ...options
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            return reject(error);
          }
          resolve(result);
        }
      );

      // Convert buffer to stream
      const stream = Readable.from(fileBuffer);
      stream.pipe(uploadStream);
    });
  }

  async uploadMultipleFiles(files, folder) {
    const uploadPromises = files.map(file => {
      const publicId = this.generatePublicId(file.originalname);
      return this.uploadFile(file.buffer, folder, publicId);
    });

    return Promise.all(uploadPromises);
  }

  async deleteFile(publicId, resourceType = 'auto') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      });
      return result;
    } catch (error) {
      throw new Error(`Failed to delete file from Cloudinary: ${error.message}`);
    }
  }

  generatePublicId(originalname) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = originalname.split('.').pop();
    const nameWithoutExt = originalname.replace(/\.[^/.]+$/, '');
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
    return `${sanitizedName}_${uniqueSuffix}`;
  }

  getUrl(publicId, options = {}) {
    return cloudinary.url(publicId, options);
  }

  getSecureUrl(publicId, options = {}) {
    return cloudinary.url(publicId, {
      secure: true,
      ...options
    });
  }
}

const cloudinaryService = new CloudinaryService();
module.exports = cloudinaryService;
module.exports.cloudinary = cloudinary;

