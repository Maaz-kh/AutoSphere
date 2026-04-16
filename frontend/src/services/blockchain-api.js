import axios from 'axios';

// Get blockchain API base URL from environment variable
const BLOCKCHAIN_API_BASE_URL = import.meta.env.VITE_BLOCKCHAIN_API_BASE_URL || 'http://localhost:5000';

export const blockchainApiClient = axios.create({
  baseURL: BLOCKCHAIN_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 seconds timeout for blockchain transactions
});

// Add response interceptor for error handling
blockchainApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle blockchain-specific errors
    if (error.response?.data?.error) {
      error.message = error.response.data.error;
    }
    return Promise.reject(error);
  }
);

export const addServiceRecord = async (vehicleId, report) => {
  const response = await blockchainApiClient.post('/service-record', {
    vehicleId,
    report
  });
  return response.data;
};


export const getServiceRecords = async (vehicleId) => {
  const response = await blockchainApiClient.get(`/service-record/${vehicleId}`);
  return response.data;
};

