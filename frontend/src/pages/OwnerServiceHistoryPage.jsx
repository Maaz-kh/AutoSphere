import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import { getServiceRecords } from '../services/blockchain-api';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import ServiceRecordModal from '../components/ServiceRecordModal';
import '../styles/ServiceHistoryPage.css';

const OwnerServiceHistoryPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [fullRecordDetails, setFullRecordDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  // Filters
  const [chassisNumber, setChassisNumber] = useState(
    location.state?.chassisNumber || ''
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Cache config (reuse modal cache behavior)
  const CACHE_PREFIX = 'service_record_';
  const CACHE_EXPIRY_HOURS = 24;

  const getCacheKey = (recordId) => `${CACHE_PREFIX}${recordId}`;

  const getCachedDetails = (recordId) => {
    try {
      const cacheKey = getCacheKey(recordId);
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      const expiryMs = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
      if (now - timestamp > expiryMs) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }
      return data;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  };

  const setCachedDetails = (recordId, data) => {
    try {
      const cacheKey = getCacheKey(recordId);
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  };

  // Only fetch when chassis is provided
  useEffect(() => {
    const loadVehicles = async () => {
      try {
        setVehiclesLoading(true);
        const res = await apiClient.get('/vehicles');
        setVehicles(res.data?.data || []);
      } catch (error) {
        console.error('Failed to load vehicles for selector:', error);
      } finally {
        setVehiclesLoading(false);
      }
    };

    loadVehicles();
  }, []);

  useEffect(() => {
    if (chassisNumber) {
      fetchServiceRecords(chassisNumber);
    } else {
      setServiceRecords([]);
      setFilteredRecords([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chassisNumber]);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceRecords, chassisNumber, dateFrom, dateTo]);

  useEffect(() => {
    if (dateFrom || dateTo) {
      const timeoutId = setTimeout(() => {
        if (chassisNumber) {
          fetchServiceRecords(chassisNumber);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const fetchServiceRecords = async (chassis) => {
    if (!chassis) {
      setServiceRecords([]);
      setFilteredRecords([]);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      const response = await apiClient.get(
        `/vehicles/${encodeURIComponent(chassis)}/service-records${params.toString() ? `?${params.toString()}` : ''}`
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

  const applyFilters = () => {
    let filtered = [...serviceRecords];

    if (chassisNumber.trim()) {
      filtered = filtered.filter(record =>
        record.vehicle_id?.toLowerCase().includes(chassisNumber.trim().toLowerCase())
      );
    }

    if (dateFrom) {
      filtered = filtered.filter(record => new Date(record.service_date) >= new Date(dateFrom));
    }

    if (dateTo) {
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.service_date);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        return recordDate <= toDate;
      });
    }

    setFilteredRecords(filtered);
  };

  const handleViewDetails = async (record, forceRefresh = false) => {
    setSelectedRecord(record);
    setShowModal(true);
    setLoadingDetails(true);
    setFullRecordDetails(null);

    const recordId = record.record_id;

    if (!forceRefresh) {
      const cachedDetails = getCachedDetails(recordId);
      if (cachedDetails) {
        setFullRecordDetails(cachedDetails);
        setLoadingDetails(false);
        return;
      }
    }

    try {
      const response = await getServiceRecords(record.vehicle_id);
      const fullRecord = response.records?.find(
        (r) => r.recordId.toString() === recordId
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

  const chassisOptions = vehicles.map((v) => ({
    value: v.chassis_number,
    label: `${v.make || ''} ${v.model || ''} ${v.variant || ''} · ${v.chassis_number}`.trim()
  }));

  const filters = [
    {
      type: 'select',
      name: 'chassisNumber',
      label: 'Chassis Number',
      value: chassisNumber,
      onChange: setChassisNumber,
      width: 'wide',
      options: [{ value: '', label: vehiclesLoading ? 'Loading...' : 'Select chassis number' }, ...chassisOptions]
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

  const showEmptyPrompt = !chassisNumber;

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="service-history-main">
        <div className="layout-page-inner service-history-container">
          <PageHeroWithFilters
            title="Service History"
            subtitle="View blockchain-backed service records for your vehicle"
            button={{
              text: 'Back to My Vehicles',
              onClick: () => navigate('/dashboard/owner')
            }}
            filters={filters}
          />

          <div className="service-history-body">
          {showEmptyPrompt ? (
            <div className="service-history-empty">
              <p>Please select a chassis number to view service history.</p>
            </div>
          ) : loading ? (
            <div className="service-history-loading">
              <p>Loading service records...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="service-history-empty">
              <p>No service records found.</p>
              {serviceRecords.length === 0 && (
                <p className="empty-hint">Try adjusting filters or selecting another chassis.</p>
              )}
            </div>
          ) : (
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

export default OwnerServiceHistoryPage;

