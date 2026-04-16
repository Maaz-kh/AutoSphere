import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import { addServiceRecord } from '../services/blockchain-api';
import { useAuth } from '../context/AuthContext';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import '../styles/AddServicePage.css';

const AddServicePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [partsLoading, setPartsLoading] = useState(true);
  const [workshopParts, setWorkshopParts] = useState([]);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    vehicleId: '', // chassis number
    dateTime: '',
    odometer: '',
    laborCharges: '',
    totalCharges: '',
    description: ''
  });
  const [replacedParts, setReplacedParts] = useState([]);
  const [updatedParts, setUpdatedParts] = useState([]);
  const [selectedReplacedPart, setSelectedReplacedPart] = useState('');
  const [selectedUpdatedPart, setSelectedUpdatedPart] = useState('');

  useEffect(() => {
    fetchWorkshopParts();
  }, []);

  const fetchWorkshopParts = async () => {
    try {
      setPartsLoading(true);
      const response = await apiClient.get('/workshop/parts');
      setWorkshopParts(response.data?.data || []);
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load parts. Please try again.';
      toast.error(msg);
    } finally {
      setPartsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleAddReplacedPart = () => {
    if (!selectedReplacedPart) {
      toast.error('Please select a part');
      return;
    }
    const part = workshopParts.find(p => p.id.toString() === selectedReplacedPart);
    if (!part) return;

    // Check if part already added
    if (replacedParts.some(p => p.id === part.id)) {
      toast.error('This part is already added');
      return;
    }

    setReplacedParts(prev => [...prev, {
      id: part.id,
      name: part.part_name,
      price: parseFloat(part.price)
    }]);
    setSelectedReplacedPart('');
  };

  const handleRemoveReplacedPart = (partId) => {
    setReplacedParts(prev => prev.filter(p => p.id !== partId));
  };

  const handleAddUpdatedPart = () => {
    if (!selectedUpdatedPart) {
      toast.error('Please select a part');
      return;
    }
    const part = workshopParts.find(p => p.id.toString() === selectedUpdatedPart);
    if (!part) return;

    // Check if part already added
    if (updatedParts.some(p => p.id === part.id)) {
      toast.error('This part is already added');
      return;
    }

    setUpdatedParts(prev => [...prev, {
      id: part.id,
      name: part.part_name,
      price: parseFloat(part.price)
    }]);
    setSelectedUpdatedPart('');
  };

  const handleRemoveUpdatedPart = (partId) => {
    setUpdatedParts(prev => prev.filter(p => p.id !== partId));
  };

  const calculateTotalCharges = () => {
    const replacedTotal = replacedParts.reduce((sum, p) => sum + p.price, 0);
    const updatedTotal = updatedParts.reduce((sum, p) => sum + p.price, 0);
    const labor = parseFloat(formData.laborCharges) || 0;
    return replacedTotal + updatedTotal + labor;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // Validation
    const newErrors = {};
    if (!formData.vehicleId.trim()) {
      newErrors.vehicleId = 'Vehicle chassis number is required';
    }
    if (!formData.dateTime) {
      newErrors.dateTime = 'Date and time is required';
    }
    if (!formData.odometer || parseFloat(formData.odometer) < 0) {
      newErrors.odometer = 'Valid odometer reading is required';
    }
    if (!formData.laborCharges || parseFloat(formData.laborCharges) < 0) {
      newErrors.laborCharges = 'Valid labor charges are required';
    }
    if (!formData.description?.trim()) {
      newErrors.description = 'Description is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    // Verify vehicle exists in database before proceeding
    try {
      const verifyResponse = await apiClient.get(`/vehicles/verify/${encodeURIComponent(formData.vehicleId.trim())}`);
      
      if (!verifyResponse.data.exists) {
        toast.error('Vehicle is not registered in the system. Please verify the chassis number.');
        setErrors({ vehicleId: 'Vehicle not Found' });
        setLoading(false);
        return;
      }
    } catch (error) {
      // Handle verification error
      const msg = error?.response?.data?.message || error?.message || 'Failed to verify vehicle. Please try again.';
      toast.error(msg);
      setLoading(false);
      return;
    }

    // Calculate total charges
    const totalCharges = calculateTotalCharges();

    // Prepare report object
    const report = {
      workshopId: user?.userId?.toString() || 'workshop_unknown',
      dateTime: new Date(formData.dateTime).toISOString(),
      odometer: parseInt(formData.odometer, 10),
      replacedParts: replacedParts.map(p => ({ name: p.name, price: p.price })),
      updatedParts: updatedParts.map(p => ({ name: p.name, price: p.price })),
      laborCharges: parseFloat(formData.laborCharges),
      totalCharges: totalCharges,
      description: formData.description.trim()
    };

    try {
      const response = await addServiceRecord(formData.vehicleId.trim(), report);
      
      // Track the service record in main database
      try {
        await apiClient.post('/workshop/service-records/track', {
          recordId: response.recordCount || response.recordId,
          vehicleId: formData.vehicleId.trim(),
          transactionHash: response.txHash,
          serviceDate: report.dateTime,
          totalCharges: totalCharges
        });
      } catch (trackError) {
        // Log but don't fail the entire operation if tracking fails
        console.error('Failed to track service record:', trackError);
        // Still show success since blockchain submission was successful
      }
      
      toast.success('Service Added Successfully');
      // Reset form
      setFormData({
        vehicleId: '',
        dateTime: '',
        odometer: '',
        laborCharges: '',
        totalCharges: '',
        description: ''
      });
      setReplacedParts([]);
      setUpdatedParts([]);
      // Navigate to Service History page
      setTimeout(() => {
        navigate('/dashboard/workshop/history');
      }, 2000);
    } catch (error) {
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to add service record. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Update total charges when parts or labor charges change
  useEffect(() => {
    const total = calculateTotalCharges();
    setFormData(prev => ({ ...prev, totalCharges: total.toFixed(2) }));
  }, [replacedParts, updatedParts, formData.laborCharges]);

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="add-service-main">
        <div className="layout-page-inner">
          <PageHeroWithFilters
            title="Add Service Record"
            subtitle="Record vehicle service history on the blockchain"
            button={{
              text: 'View Service History',
              onClick: () => navigate('/dashboard/workshop/history')
            }}
          />

        <div className="add-service-form-container">
          <form onSubmit={handleSubmit} className="add-service-form">
            {/* Vehicle Information Section */}
            <section className="form-section">
              <h2 className="section-title">Vehicle Information</h2>
              
              <div className="form-grid">
                <div className="ui-form-group">
                  <label className="ui-label" htmlFor="vehicleId">
                    Vehicle Chassis Number <span className="ui-required">*</span>
                  </label>
                  <input
                    type="text"
                    id="vehicleId"
                    name="vehicleId"
                    value={formData.vehicleId}
                    onChange={handleInputChange}
                    placeholder="Enter chassis number"
                    required
                    className={`ui-input ${errors.vehicleId ? 'ui-error' : ''}`}
                    maxLength={17}
                  />
                  {errors.vehicleId && (
                    <span className="field-error">{errors.vehicleId}</span>
                  )}
                </div>

                <div className="ui-form-group">
                  <label className="ui-label" htmlFor="dateTime">
                    Service Date & Time <span className="ui-required">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    id="dateTime"
                    name="dateTime"
                    value={formData.dateTime}
                    onChange={handleInputChange}
                    required
                    className={`ui-input ${errors.dateTime ? 'ui-error' : ''}`}
                  />
                  {errors.dateTime && (
                    <span className="field-error">{errors.dateTime}</span>
                  )}
                </div>

                <div className="ui-form-group">
                  <label className="ui-label" htmlFor="odometer">
                    Odometer Reading (km) <span className="ui-required">*</span>
                  </label>
                  <input
                    type="number"
                    id="odometer"
                    name="odometer"
                    value={formData.odometer}
                    onChange={handleInputChange}
                    placeholder="0"
                    min="0"
                    required
                    className={`ui-input ${errors.odometer ? 'ui-error' : ''}`}
                  />
                  {errors.odometer && (
                    <span className="field-error">{errors.odometer}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Parts Section */}
            <section className="form-section">
              <h2 className="section-title">Parts</h2>
              
              <div className="parts-container">
                {/* Replaced Parts */}
                <div className="parts-subsection">
                  <h3 className="subsection-title">Replaced Parts</h3>
                  <div className="part-selector">
                    <select
                      className="ui-select"
                      value={selectedReplacedPart}
                      onChange={(e) => setSelectedReplacedPart(e.target.value)}
                      disabled={partsLoading || workshopParts.length === 0}
                    >
                      <option value="">
                        {partsLoading ? 'Loading parts...' : workshopParts.length === 0 ? 'No parts available' : 'Select a part'}
                      </option>
                      {workshopParts
                        .filter(part => !replacedParts.some(p => p.id === part.id))
                        .map(part => (
                          <option key={part.id} value={part.id}>
                            {part.part_name} - Rs. {parseFloat(part.price).toLocaleString()}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="ui-btn-primary add-part-btn"
                      onClick={handleAddReplacedPart}
                      disabled={!selectedReplacedPart || partsLoading}
                    >
                      Add
                    </button>
                  </div>
                  {replacedParts.length > 0 && (
                    <div className="parts-list">
                      {replacedParts.map(part => (
                        <div key={part.id} className="part-item">
                          <span className="part-name">{part.name}</span>
                          <span className="part-price">Rs. {part.price.toLocaleString()}</span>
                          <button
                            type="button"
                            className="remove-part-btn"
                            onClick={() => handleRemoveReplacedPart(part.id)}
                            title="Remove part"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Updated Parts */}
                <div className="parts-subsection">
                  <h3 className="subsection-title">Updated Parts</h3>
                  <div className="part-selector">
                    <select
                      className="ui-select"
                      value={selectedUpdatedPart}
                      onChange={(e) => setSelectedUpdatedPart(e.target.value)}
                      disabled={partsLoading || workshopParts.length === 0}
                    >
                      <option value="">
                        {partsLoading ? 'Loading parts...' : workshopParts.length === 0 ? 'No parts available' : 'Select a part'}
                      </option>
                      {workshopParts
                        .filter(part => !updatedParts.some(p => p.id === part.id))
                        .map(part => (
                          <option key={part.id} value={part.id}>
                            {part.part_name} - Rs. {parseFloat(part.price).toLocaleString()}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="ui-btn-primary add-part-btn"
                      onClick={handleAddUpdatedPart}
                      disabled={!selectedUpdatedPart || partsLoading}
                    >
                      Add
                    </button>
                  </div>
                  {updatedParts.length > 0 && (
                    <div className="parts-list">
                      {updatedParts.map(part => (
                        <div key={part.id} className="part-item">
                          <span className="part-name">{part.name}</span>
                          <span className="part-price">Rs. {part.price.toLocaleString()}</span>
                          <button
                            type="button"
                            className="remove-part-btn"
                            onClick={() => handleRemoveUpdatedPart(part.id)}
                            title="Remove part"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Charges Section */}
            <section className="form-section">
              <h2 className="section-title">Charges</h2>
              
              <div className="form-grid">
                <div className="ui-form-group">
                  <label className="ui-label" htmlFor="laborCharges">
                    Labor Charges (Rs.) <span className="ui-required">*</span>
                  </label>
                  <input
                    type="number"
                    id="laborCharges"
                    name="laborCharges"
                    value={formData.laborCharges}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                    className={`ui-input ${errors.laborCharges ? 'ui-error' : ''}`}
                  />
                  {errors.laborCharges && (
                    <span className="field-error">{errors.laborCharges}</span>
                  )}
                </div>

                <div className="ui-form-group">
                  <label className="ui-label" htmlFor="totalCharges">
                    Total Charges (Rs.)
                  </label>
                  <input
                    type="text"
                    id="totalCharges"
                    name="totalCharges"
                    value={formData.totalCharges}
                    readOnly
                    className="ui-input readonly-input"
                  />
                  <small className="form-hint">Calculated automatically from parts and labor</small>
                </div>
              </div>
            </section>

            {/* Description Section */}
            <section className="form-section">
              <h2 className="section-title">Service Description</h2>
              
              <div className="ui-form-group ui-full-width">
                <label className="ui-label" htmlFor="description">
                  Description <span className="ui-required">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Describe the service performed..."
                  rows="4"
                  required
                  className={`ui-textarea ${errors.description ? 'ui-error' : ''}`}
                />
                {errors.description && (
                  <span className="field-error">{errors.description}</span>
                )}
              </div>
            </section>

            <div className="ui-form-actions add-service-form-actions">
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={() => navigate('/dashboard/workshop')}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-btn-primary"
                disabled={loading}
              >
                {loading ? 'Submitting...' : 'Add Service Record'}
              </button>
            </div>
          </form>
        </div>
        </div>
      </main>
    </div>
  );
};

export default AddServicePage;

