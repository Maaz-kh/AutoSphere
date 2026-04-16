import axios from 'axios';

// Get damage detection API base URL from environment variable
const DAMAGE_DETECTION_API_BASE_URL = import.meta.env.VITE_DAMAGE_DETECTION_API_BASE_URL || 'http://127.0.0.1:8001';

export const damageDetectionApiClient = axios.create({
  baseURL: DAMAGE_DETECTION_API_BASE_URL,
  headers: {
    'Content-Type': 'multipart/form-data'
  },
  timeout: 120000 // 2 minutes timeout for image processing
});

// Add response interceptor for error handling
damageDetectionApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle damage detection-specific errors
    if (error.response?.data?.detail) {
      error.message = error.response.data.detail;
    } else if (error.response?.data?.error) {
      error.message = error.response.data.error;
    }
    return Promise.reject(error);
  }
);

/**
 * Detect vehicle damage from multiple images
 * @param {File[]} imageFiles - Array of image files (1-10 images)
 * @returns {Promise} Analysis results with damages, costs, and annotated images
 */
export const detectVehicleDamage = async (imageFiles) => {
  const formData = new FormData();
  
  // Append all image files to FormData
  imageFiles.forEach((file) => {
    formData.append('files', file);
  });

  const response = await damageDetectionApiClient.post('/detect-multi-view', formData);
  return response.data;
};

/**
 * Check if damage detection API is healthy
 * @returns {Promise} Health status
 */
export const checkDamageDetectionHealth = async () => {
  const response = await damageDetectionApiClient.get('/health');
  return response.data;
};

