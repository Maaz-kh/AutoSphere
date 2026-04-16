const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinaryService = require('./cloudinary-service');
const { cloudinary } = require('./cloudinary-service');

class FileUploadHandler {
  constructor() {}

  createStorage(paramsFn, maxFileSizeMB = 10) {
    const storage = new CloudinaryStorage({
      cloudinary,
      params: paramsFn
    });

    return multer({
      storage,
      limits: { fileSize: maxFileSizeMB * 1024 * 1024 }
    });
  }

  uploadProfileImage() {
    const upload = this.createStorage(
      (req, file) => ({
        folder: 'profile_images',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
        public_id: cloudinaryService.generatePublicId(file.originalname)
      }),
      5
    );
    return upload.single('profile_image');
  }

  uploadDocument() {
    const upload = this.createStorage(
      (req, file) => ({
        folder: 'vehicle_documents',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
        public_id: cloudinaryService.generatePublicId(file.originalname)
      }),
      10
    );
    return upload.single('document');
  }

  uploadCNICImage() {
    const upload = this.createStorage(
      (req, file) => ({
        folder: 'cnic_images',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        public_id: cloudinaryService.generatePublicId(file.originalname)
      }),
      5
    );
    return upload.single('cnic_image');
  }

  /**
   * Combined upload handler for vehicle registration
   * Handles both documents and images with Cloudinary storage
   */
  uploadVehicleRegistrationFiles() {
    const upload = this.createStorage(
      (req, file) => {
        const isDocumentField =
          file.fieldname === 'registration_certificate' ||
          file.fieldname === 'additional_documents';

        const folder = isDocumentField ? 'vehicle_documents' : 'vehicle_images';
        const resourceType = isDocumentField ? 'auto' : 'image';

        return {
          folder,
          resource_type: resourceType,
          allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
          public_id: cloudinaryService.generatePublicId(file.originalname)
        };
      },
      10
    );

    return upload.fields([
      { name: 'registration_certificate', maxCount: 1 },
      { name: 'additional_documents', maxCount: 5 },
      { name: 'front_image', maxCount: 1 },
      { name: 'back_image', maxCount: 1 },
      { name: 'interior_image', maxCount: 1 }
    ]);
  }

  /**
   * Auction listing photos: up to 10 images (upload only). Max 5MB per file for quality.
   */
  uploadAuctionPhotos() {
    const upload = this.createStorage(
      (req, file) => ({
        folder: 'auction_photos',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        public_id: cloudinaryService.generatePublicId(file.originalname)
      }),
      5
    );
    return upload.array('photos', 10);
  }
}

module.exports = new FileUploadHandler();
