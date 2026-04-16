import axios from 'axios';

// Get valuation API base URL from environment variable
const VALUATION_API_BASE_URL = import.meta.env.VITE_VALUATION_API_BASE_URL || 'http://127.0.0.1:8000';

export const valuationApiClient = axios.create({
  baseURL: VALUATION_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 seconds timeout
});

// Add response interceptor for error handling
valuationApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle valuation-specific errors
    if (error.response?.data?.detail) {
      error.message = error.response.data.detail;
    } else if (error.response?.data?.error) {
      error.message = error.response.data.error;
    }
    return Promise.reject(error);
  }
);

export const predictVehiclePrice = async (vehicleData) => {
  const response = await valuationApiClient.post('/predict', vehicleData);
  return response.data;
};

export const checkValuationHealth = async () => {
  const response = await valuationApiClient.get('/');
  return response.data;
};

