import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Upload, Eye, X, ZoomIn, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import { detectVehicleDamage } from '../services/damage-detection-api';
import '../styles/VehicleDamageDetectionPage.css';

const VehicleDamageDetectionPage = () => {
  const navigate = useNavigate();
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDamage, setSelectedDamage] = useState(null);
  const [viewMode, setViewMode] = useState('gallery'); // 'gallery' or 'annotated'

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length > 10) {
      setError('Maximum 10 images allowed');
      toast.error('Maximum 10 images allowed');
      return;
    }

    // Validate file types
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        return false;
      }
      return true;
    });

    if (validFiles.length !== files.length) {
      toast.error('Some files were invalid. Only image files are allowed.');
    }

    if (validFiles.length === 0) {
      return;
    }

    setSelectedImages(validFiles);
    
    // Generate previews
    const previews = validFiles.map(file => URL.createObjectURL(file));
    setImagePreviews(previews);
    
    setResults(null);
    setError(null);
  };

  const handleRemoveImage = (index) => {
    const newImages = selectedImages.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    
    // Revoke old URLs to prevent memory leaks
    URL.revokeObjectURL(imagePreviews[index]);
    
    setSelectedImages(newImages);
    setImagePreviews(newPreviews);
  };

  const handleClearAll = () => {
    // Revoke all preview URLs
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    
    setSelectedImages([]);
    setImagePreviews([]);
    setResults(null);
    setError(null);
    setSelectedDamage(null);
  };

  const analyzeImages = async () => {
    if (selectedImages.length === 0) {
      toast.error('Please select at least one image');
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const data = await detectVehicleDamage(selectedImages);
      setResults(data);
      setViewMode('gallery');
      toast.success('Damage analysis completed successfully');
      
      // Scroll to results
      setTimeout(() => {
        const resultsElement = document.getElementById('damage-results');
        if (resultsElement) {
          resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (err) {
      const errorMsg = err?.response?.data?.detail || err?.message || 'Failed to analyze images. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setAnalyzing(false);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'minor': return 'severity-minor';
      case 'moderate': return 'severity-moderate';
      case 'severe': return 'severity-severe';
      default: return 'severity-default';
    }
  };

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="damage-detection-main">
        <div className="layout-page-inner damage-detection-container">
          <PageHeroWithFilters
            title="Vehicle Damage Detection"
            subtitle="Upload multiple photos of your vehicle for comprehensive AI-powered damage assessment"
            button={{
              text: 'Back to My Vehicles',
              onClick: () => navigate('/dashboard/owner')
            }}
            filters={[]}
          />

          <div className="damage-detection-content">
            {/* Upload Section */}
            <div className="upload-section">
              <h3 className="section-title">Upload Images (1-10)</h3>
              
              {imagePreviews.length === 0 ? (
                <div className="upload-area">
                  <Upload className="upload-icon" />
                  <p className="upload-text">Select multiple car images from different angles</p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                    className="file-input"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="ui-btn-primary damage-upload-select-label">
                    <Upload size={18} aria-hidden />
                    Select images
                  </label>
                  <p className="upload-tip">
                    Tip: Upload front, rear, left, right views for best results
                  </p>
                </div>
              ) : (
                <div className="images-preview-section">
                  <div className="images-grid">
                    {imagePreviews.map((preview, idx) => (
                      <div key={idx} className="image-preview-item">
                        <img
                          src={preview}
                          alt={`Preview ${idx + 1}`}
                          className="preview-image"
                        />
                        <span className="image-number">{idx + 1}</span>
                        <button
                          type="button"
                          className="remove-image-btn"
                          onClick={() => handleRemoveImage(idx)}
                          aria-label="Remove image"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="upload-actions">
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="ui-btn-secondary"
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      onClick={analyzeImages}
                      disabled={analyzing}
                      className="ui-btn-primary damage-analyze-btn"
                    >
                      {analyzing ? (
                        <>
                          <span className="spinner"></span>
                          Analyzing {selectedImages.length} images...
                        </>
                      ) : (
                        <>
                          <Eye size={18} />
                          Analyze Damages
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Results Section */}
            {results && (
              <>
                <div className="results-section" id="damage-results">
                  <h3 className="section-title">Analysis Results</h3>
                  
                  <div className="results-card">
                    {/* Damages Found */}
                    <div className="result-item">
                      <span className="result-label">Damages Found</span>
                      <span className="result-value">{results.total_damages_found}</span>
                    </div>

                    {/* Total Cost Estimate */}
                    <div className="result-item main-price">
                      <span className="result-label">Total Estimated Cost</span>
                      <span className="result-value">
                        PKR {results.total_cost_estimate_pkr.estimated_pkr.toLocaleString()}
                      </span>
                      <p className="result-range">
                        Range: PKR {results.total_cost_estimate_pkr.min_pkr.toLocaleString()} - {results.total_cost_estimate_pkr.max_pkr.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Detected Damages Section - Separate Card */}
                <div className="detected-damages-section">
                  <h3 className="section-title">Detected Damages</h3>
                  
                  {/* View Mode Toggle */}
                  <div className="view-mode-toggle">
                    <button
                      type="button"
                      onClick={() => setViewMode('gallery')}
                      className={viewMode === 'gallery' ? 'toggle-btn active' : 'toggle-btn'}
                    >
                      Damage Gallery
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('annotated')}
                      className={viewMode === 'annotated' ? 'toggle-btn active' : 'toggle-btn'}
                    >
                      Annotated Images
                    </button>
                  </div>

                  {/* Annotated Images View */}
                  {viewMode === 'annotated' && results.annotated_images && (
                    <div className="annotated-images-section">
                      <h4 className="subsection-title">Annotated Images (with Bounding Boxes)</h4>
                      <div className="annotated-grid">
                        {Object.entries(results.annotated_images).map(([imageId, base64]) => (
                          <div key={imageId} className="annotated-image-card">
                            <div className="annotated-image-header">
                              <p className="annotated-image-label">{imageId.replace('_', ' ').toUpperCase()}</p>
                            </div>
                            <img
                              src={`data:image/jpeg;base64,${base64}`}
                              alt={imageId}
                              className="annotated-image"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="annotated-note">
                        ✓ All damages are marked with colored bounding boxes
                      </p>
                    </div>
                  )}

                  {/* Damage Gallery View */}
                  {viewMode === 'gallery' && (
                    <div className="damage-gallery-section">
                      <div className="damage-cards-grid">
                        {results.damages.map((damage, idx) => (
                          <div key={damage.damage_id} className="damage-card">
                            {/* Damage Image */}
                            <div 
                              className="damage-image-container"
                              onClick={() => setSelectedDamage(damage)}
                            >
                              <img
                                src={`data:image/jpeg;base64,${damage.representative_image}`}
                                alt={damage.damage_id}
                                className="damage-image"
                              />
                              <div className="damage-image-overlay">
                                <ZoomIn className="zoom-icon" />
                              </div>
                              <span className="damage-number">#{idx + 1}</span>
                            </div>

                            {/* Damage Info */}
                            <div className="damage-info">
                              <div className="damage-header">
                                <h4 className="damage-type">
                                  {damage.damage_type.replace('_', ' ')}
                                </h4>
                                <span className={`severity-badge ${getSeverityColor(damage.severity)}`}>
                                  {damage.severity.toUpperCase()}
                                </span>
                              </div>

                              <div className="damage-details">
                                <div className="detail-row">
                                  <span className="detail-label">Severity Score:</span>
                                  <span className="detail-value">{damage.severity_score.toFixed(1)}/100</span>
                                </div>
                                <div className="detail-row">
                                  <span className="detail-label">Confidence:</span>
                                  <span className="detail-value">{(damage.confidence_avg * 100).toFixed(1)}%</span>
                                </div>
                                <div className="detail-row">
                                  <span className="detail-label">Views:</span>
                                  <span className="detail-value">{damage.view_count} angle{damage.view_count > 1 ? 's' : ''}</span>
                                </div>
                              </div>

                              {/* View Badges */}
                              <div className="view-badges">
                                {damage.image_ids.map((imgId, i) => (
                                  <span key={i} className="view-badge">
                                    {imgId}
                                  </span>
                                ))}
                              </div>

                              {/* Cost */}
                              <div className="damage-cost">
                                <div className="cost-row">
                                  <span className="cost-label">Repair Cost:</span>
                                  <span className="cost-value">
                                    PKR {damage.estimated_cost_pkr.estimated_pkr.toLocaleString()}
                                  </span>
                                </div>
                                <p className="cost-range">
                                  Range: PKR {damage.estimated_cost_pkr.min_pkr.toLocaleString()} - {damage.estimated_cost_pkr.max_pkr.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      </main>

      {/* Selected Damage Modal */}
      {selectedDamage && (
        <div className="modal-overlay" onClick={() => setSelectedDamage(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedDamage.damage_type.replace('_', ' ')}
              </h3>
              <button 
                type="button"
                className="modal-close"
                onClick={() => setSelectedDamage(null)}
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>

            {/* All views of this damage */}
            <div className="modal-images-grid">
              {selectedDamage.cropped_images.map((crop, idx) => (
                <img
                  key={idx}
                  src={`data:image/jpeg;base64,${crop}`}
                  alt={`View ${idx + 1}`}
                  className="modal-cropped-image"
                />
              ))}
            </div>

            {/* Detailed metrics */}
            <div className="modal-metrics">
              <h4 className="metrics-title">Damage Metrics:</h4>
              {Object.entries(selectedDamage.damage_metrics).map(([key, value]) => (
                <div key={key} className="metric-row">
                  <span className="metric-label">{key.replace('_', ' ')}:</span>
                  <span className="metric-value">
                    {typeof value === 'number' ? value.toFixed(2) : value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleDamageDetectionPage;

