import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import { getServiceRecords } from '../services/blockchain-api';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import ServiceRecordModal from '../components/ServiceRecordModal';
import '../styles/ServiceHistoryPage.css';

const ServiceHistoryPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [fullRecordDetails, setFullRecordDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filter states
  const [chassisNumber, setChassisNumber] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Cache configuration
  const CACHE_PREFIX = 'service_record_';
  const CACHE_EXPIRY_HOURS = 24;

  // Generate cache key for a specific record ID
  const getCacheKey = (recordId) => `${CACHE_PREFIX}${recordId}`;

  // Retrieve cached service record details if available and not expired
  const getCachedDetails = (recordId) => {
    try {
      const cacheKey = getCacheKey(recordId);
      const cached = sessionStorage.getItem(cacheKey);
      
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      const cacheAge = now - timestamp;
      const expiryMs = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;

      if (cacheAge > expiryMs) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  };

  // Store service record details in session storage cache
  const setCachedDetails = (recordId, data) => {
    try {
      const cacheKey = getCacheKey(recordId);
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error writing to cache:', error);
      if (error.name === 'QuotaExceededError') {
        clearOldestCacheEntries();
      }
    }
  };

  // Clear oldest 25% of cache entries when storage quota is exceeded
  const clearOldestCacheEntries = () => {
    try {
      const cacheEntries = [];
      
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          try {
            const cached = sessionStorage.getItem(key);
            const { timestamp } = JSON.parse(cached);
            cacheEntries.push({ key, timestamp });
          } catch (e) {
            sessionStorage.removeItem(key);
          }
        }
      }

      cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
      const entriesToRemove = Math.ceil(cacheEntries.length * 0.25);
      for (let i = 0; i < entriesToRemove; i++) {
        sessionStorage.removeItem(cacheEntries[i].key);
      }
    } catch (error) {
      console.error('Error clearing old cache entries:', error);
    }
  };

  // Fetch service records on component mount
  useEffect(() => {
    fetchServiceRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply client-side filters when records or filter values change
  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceRecords, chassisNumber, dateFrom, dateTo]);

  // Debounced server-side fetch when date filters change
  useEffect(() => {
    if (dateFrom || dateTo) {
      const timeoutId = setTimeout(() => {
        fetchServiceRecords();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Fetch service records from backend with optional filters
  const fetchServiceRecords = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      // Build query parameters for server-side filtering
      if (chassisNumber.trim()) {
        params.append('chassisNumber', chassisNumber.trim());
      }
      if (dateFrom) {
        params.append('dateFrom', dateFrom);
      }
      if (dateTo) {
        params.append('dateTo', dateTo);
      }

      const queryString = params.toString();
      const response = await apiClient.get(
        `/workshop/service-records${queryString ? `?${queryString}` : ''}`
      );
      setServiceRecords(response.data?.data || []);
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load service records. Please try again.';
      toast.error(msg);
      setServiceRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // Apply client-side filters for real-time filtering (chassis number search)
  const applyFilters = () => {
    let filtered = [...serviceRecords];

    // Filter by chassis number (case-insensitive partial match)
    if (chassisNumber.trim()) {
      filtered = filtered.filter(record =>
        record.vehicle_id?.toLowerCase().includes(chassisNumber.trim().toLowerCase())
      );
    }

    // Filter by date range (from date)
    if (dateFrom) {
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.service_date);
        return recordDate >= new Date(dateFrom);
      });
    }

    // Filter by date range (to date - includes entire day)
    if (dateTo) {
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.service_date);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // Include entire day
        return recordDate <= toDate;
      });
    }

    setFilteredRecords(filtered);
  };

  // Open modal and fetch full service record details from blockchain
  // Uses cache if available, unless forceRefresh is true
  const handleViewDetails = async (record, forceRefresh = false) => {
    setSelectedRecord(record);
    setShowModal(true);
    setLoadingDetails(true);
    setFullRecordDetails(null);

    const recordId = record.record_id;

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cachedDetails = getCachedDetails(recordId);
      if (cachedDetails) {
        setFullRecordDetails(cachedDetails);
        setLoadingDetails(false);
        return;
      }
    }

    // Fetch from blockchain if not cached or forcing refresh
    try {
      const response = await getServiceRecords(record.vehicle_id);
      const fullRecord = response.records?.find(
        r => r.recordId.toString() === recordId
      );
      
      if (fullRecord) {
        setCachedDetails(recordId, fullRecord);
        setFullRecordDetails(fullRecord);
      } else {
        setFullRecordDetails(null);
      }
    } catch (error) {
      console.error('Failed to fetch full record details:', error);
      toast.warning('Could not load full details from blockchain, showing basic information.');
      setFullRecordDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Force refresh of service record details from blockchain (bypasses cache)
  const handleRefreshDetails = () => {
    if (selectedRecord) {
      handleViewDetails(selectedRecord, true);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedRecord(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount) => {
    return `Rs. ${parseFloat(amount || 0).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const filters = [
    {
      type: 'search',
      name: 'chassisNumber',
      label: 'Chassis Number',
      placeholder: 'Search by chassis number...',
      value: chassisNumber,
      onChange: setChassisNumber,
      width: 'wide'
    },
    {
      type: 'date',
      name: 'dateFrom',
      label: 'From Date',
      placeholder: 'From Date',
      value: dateFrom,
      onChange: setDateFrom
    },
    {
      type: 'date',
      name: 'dateTo',
      label: 'To Date',
      placeholder: 'To Date',
      value: dateTo,
      onChange: setDateTo
    }
  ];

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="service-history-main">
        <div className="layout-page-inner service-history-container">
          <PageHeroWithFilters
            title="Service History"
            subtitle="View all service records performed by your workshop"
            button={{
              text: 'Add Service',
              onClick: () => navigate('/dashboard/workshop/add-service')
            }}
            filters={filters}
          />

          <div className="service-history-body">
          {loading ? (
            <div className="service-history-loading">
              <p>Loading service records...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="service-history-empty">
              <p>No service records found.</p>
              {serviceRecords.length === 0 && (
                <p className="empty-hint">Start by adding your first service record.</p>
              )}
            </div>
          ) : (
            <>
              <div className="service-history-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Records</span>
                  <span className="stat-value">{filteredRecords.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Revenue</span>
                  <span className="stat-value">
                    {formatCurrency(
                      filteredRecords.reduce(
                        (sum, record) => sum + parseFloat(record.total_charges || 0),
                        0
                      )
                    )}
                  </span>
                </div>
              </div>

              <div className="service-records-grid">
                {filteredRecords.map((record) => (
                  <div key={record.id} className="service-record-card">
                    <div className="service-card-header">
                      <div className="service-card-vehicle">
                        <span className="service-card-label">Vehicle</span>
                        <span className="service-card-value chassis-number">
                          {record.vehicle_id || 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="service-card-body">
                      <div className="service-card-info">
                        <div className="service-info-item">
                          <span className="service-info-label">Service Date</span>
                          <span className="service-info-value">
                            {formatDate(record.service_date)}
                          </span>
                        </div>
                        <div className="service-info-item">
                          <span className="service-info-label">Total Charges</span>
                          <span className="service-info-value amount">
                            {formatCurrency(record.total_charges)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="service-card-actions">
                      <button
                        type="button"
                        className="view-details-btn"
                        onClick={() => handleViewDetails(record)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          </div>
        </div>

        {showModal && selectedRecord && (
          <ServiceRecordModal
            record={selectedRecord}
            fullDetails={fullRecordDetails}
            loadingDetails={loadingDetails}
            onClose={handleModalClose}
            onRefresh={handleRefreshDetails}
          />
        )}
      </main>
    </div>
  );
};

export default ServiceHistoryPage;

