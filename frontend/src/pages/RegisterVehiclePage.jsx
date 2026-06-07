import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Upload, X, FileText } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import useVehicleCascading from '../hooks/useVehicleCascading';
import '../styles/RegisterVehicle.css';

const RegisterVehiclePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    registration_number: '',
    chassis_number: '',
    engine_number: '',
    make: '',
    model: '',
    variant: '',
    model_year: '',
    body_type: '',
    fuel_type: 'petrol',
    transmission_type: '',
    assembly: '',
    engine_capacity: '',
    mileage_km: '',
    color: '',
    registered_city: '',
    purchase_date: ''
  });

  // Use cascading hook for vehicle data
  const { availableOptions, flatOptions } = useVehicleCascading(formData, setFormData);

  // Helper function to normalize transmission value for backend
  const normalizeTransmission = (transmission) => {
    return transmission.toLowerCase();
  };

  const [files, setFiles] = useState({
    registration_certificate: null,
    additional_documents: [],
    front_image: null,
    back_image: null,
    interior_image: null
  });

  const [imagePreviewUrls, setImagePreviewUrls] = useState({
    front_image: null,
    back_image: null,
    interior_image: null
  });

  const frontImageInputRef = useRef(null);
  const backImageInputRef = useRef(null);
  const interiorImageInputRef = useRef(null);
  const registrationCertInputRef = useRef(null);
  const additionalDocsInputRef = useRef(null);
  const [dragOverField, setDragOverField] = useState(null);

  useEffect(() => {
    const urls = {
      front_image: files.front_image ? URL.createObjectURL(files.front_image) : null,
      back_image: files.back_image ? URL.createObjectURL(files.back_image) : null,
      interior_image: files.interior_image ? URL.createObjectURL(files.interior_image) : null
    };
    setImagePreviewUrls((prev) => {
      ['front_image', 'back_image', 'interior_image'].forEach((k) => {
        if (prev[k]) URL.revokeObjectURL(prev[k]);
      });
      return urls;
    });
    return () => {
      ['front_image', 'back_image', 'interior_image'].forEach((k) => {
        if (urls[k]) URL.revokeObjectURL(urls[k]);
      });
    };
  }, [files.front_image, files.back_image, files.interior_image]);

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

  const DOCUMENT_ACCEPT_LABEL = 'PDF, JPG, PNG, DOC, DOCX';

  const isAcceptedDocumentFile = (file) => {
    if (!file || !file.name) return false;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'].includes(ext || '');
  };

  const handleFileChange = (fieldName, e) => {
    const selectedFiles = Array.from(e.target.files || []);

    if (fieldName === 'additional_documents') {
      const accepted = selectedFiles.filter(isAcceptedDocumentFile);
      if (accepted.length < selectedFiles.length) {
        toast.warn(`Some files were skipped. Use ${DOCUMENT_ACCEPT_LABEL}.`);
      }
      setFiles((prev) => {
        const merged = [...prev.additional_documents, ...accepted].slice(0, 5);
        if (merged.length < prev.additional_documents.length + accepted.length) {
          toast.info('Maximum 5 additional documents. Extra files were not added.');
        }
        return { ...prev, additional_documents: merged };
      });
      e.target.value = '';
      if (errors.additional_documents) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.additional_documents;
          return next;
        });
      }
      return;
    }

    // Single file fields
    if (
      fieldName === 'registration_certificate' ||
      fieldName === 'front_image' ||
      fieldName === 'back_image' ||
      fieldName === 'interior_image'
    ) {
      const file = selectedFiles[0] || null;
      if (fieldName === 'registration_certificate' && file && !isAcceptedDocumentFile(file)) {
        toast.warn(`Please choose a supported document type (${DOCUMENT_ACCEPT_LABEL}).`);
        e.target.value = '';
        return;
      }
      setFiles((prev) => ({
        ...prev,
        [fieldName]: file
      }));
      if (fieldName === 'registration_certificate') {
        e.target.value = '';
      }
    } else {
      setFiles((prev) => ({
        ...prev,
        [fieldName]: selectedFiles
      }));
    }

    if (errors[fieldName]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const setSingleFile = (fieldName, file) => {
    setFiles((prev) => ({
      ...prev,
      [fieldName]: file || null
    }));
  };

  const handleDropFile = (fieldName, file) => {
    if (!file) return;
    setDragOverField(null);
    setSingleFile(fieldName, file);
    if (errors[fieldName]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const makeDropHandlers = (fieldName) => ({
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField(fieldName);
    },
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField(fieldName);
    },
    onDragLeave: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField((prev) => (prev === fieldName ? null : prev));
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0] || null;
      handleDropFile(fieldName, file);
    }
  });

  const registrationCertificateDropHandlers = {
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField('registration_certificate');
    },
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField('registration_certificate');
    },
    onDragLeave: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField((prev) => (prev === 'registration_certificate' ? null : prev));
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField(null);
      const file = e.dataTransfer?.files?.[0] || null;
      if (!file) return;
      if (!isAcceptedDocumentFile(file)) {
        toast.warn(`Please drop a supported file (${DOCUMENT_ACCEPT_LABEL}).`);
        return;
      }
      handleDropFile('registration_certificate', file);
    }
  };

  const additionalDocumentsDropHandlers = {
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField('additional_documents');
    },
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField('additional_documents');
    },
    onDragLeave: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField((prev) => (prev === 'additional_documents' ? null : prev));
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverField(null);
      const incoming = Array.from(e.dataTransfer?.files || []).filter(isAcceptedDocumentFile);
      if (incoming.length === 0) {
        if ((e.dataTransfer?.files?.length || 0) > 0) {
          toast.warn(`Please drop supported files only (${DOCUMENT_ACCEPT_LABEL}).`);
        }
        return;
      }
      setFiles((prev) => {
        const merged = [...prev.additional_documents, ...incoming].slice(0, 5);
        if (merged.length < prev.additional_documents.length + incoming.length) {
          toast.info('Maximum 5 additional documents. Extra files were not added.');
        }
        return { ...prev, additional_documents: merged };
      });
      if (errors.additional_documents) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.additional_documents;
          return next;
        });
      }
    }
  };

  const removeFile = (fieldName, index = null) => {
    if (index !== null) {
      setFiles(prev => ({
        ...prev,
        [fieldName]: prev[fieldName].filter((_, i) => i !== index)
      }));
    } else {
      setFiles(prev => ({
        ...prev,
        [fieldName]: null
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // Validate required registration certificate on client
    if (!files.registration_certificate) {
      setLoading(false);
      toast.error('Registration certificate is required');
      setErrors({ registration_certificate: 'Registration certificate is required' });
      return;
    }

    // Validate required vehicle images on client
    if (!files.front_image || !files.back_image || !files.interior_image) {
      setLoading(false);
      toast.error('Front, back, and interior images are required');
      setErrors({
        front_image: !files.front_image ? 'Front image is required' : undefined,
        back_image: !files.back_image ? 'Back image is required' : undefined,
        interior_image: !files.interior_image ? 'Interior image is required' : undefined
      });
      return;
    }

    try {
      const formDataToSend = new FormData();

      // Add required form fields
      formDataToSend.append('registration_number', formData.registration_number.trim());
      formDataToSend.append('chassis_number', formData.chassis_number.trim());
      formDataToSend.append('engine_number', formData.engine_number.trim());
      formDataToSend.append('make', formData.make.trim());
      formDataToSend.append('model', formData.model.trim());
      formDataToSend.append('variant', formData.variant.trim());
      const modelYearNum = parseInt(formData.model_year, 10);
      if (!isNaN(modelYearNum)) {
        formDataToSend.append('model_year', modelYearNum);
      }
      formDataToSend.append('body_type', formData.body_type.trim());
      formDataToSend.append('fuel_type', formData.fuel_type);
      formDataToSend.append('transmission_type', formData.transmission_type);
      formDataToSend.append('assembly', formData.assembly.trim());
      formDataToSend.append('engine_capacity', formData.engine_capacity.trim());

      // Add optional form fields
      if (formData.mileage_km && formData.mileage_km.toString().trim()) {
        const mileageNum = parseInt(formData.mileage_km.toString().trim(), 10);
        if (!isNaN(mileageNum)) {
          formDataToSend.append('mileage_km', mileageNum);
        }
      }
      if (formData.color && formData.color.trim()) {
        formDataToSend.append('color', formData.color.trim());
      }
      if (formData.registered_city && formData.registered_city.trim()) {
        formDataToSend.append('registered_city', formData.registered_city.trim());
      }
      if (formData.purchase_date) {
        formDataToSend.append('purchase_date', formData.purchase_date);
      }

      // Add files
      formDataToSend.append('registration_certificate', files.registration_certificate);
      files.additional_documents.forEach(file => {
        formDataToSend.append('additional_documents', file);
      });
      formDataToSend.append('front_image', files.front_image);
      formDataToSend.append('back_image', files.back_image);
      formDataToSend.append('interior_image', files.interior_image);

      // Don't set Content-Type header - let axios set it automatically with boundary for multipart
      const response = await apiClient.post('/vehicles', formDataToSend);

      if (response.data.success) {
        toast.success('Vehicle registered successfully!');
        navigate('/dashboard/owner');
      }
    } catch (error) {
      if (error.response?.data?.errors) {
        const validationErrors = {};
        const errorMessages = [];
        error.response.data.errors.forEach(err => {
          if (err.path) {
            validationErrors[err.path] = err.msg;
            errorMessages.push(err.msg);
          }
        });
        setErrors(validationErrors);
        if (errorMessages.length > 0) {
          toast.error(errorMessages.join(', '));
        }
      } else {
        const errorMsg = error.response?.data?.message || 'Failed to register vehicle. Please try again.';
        toast.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dash-shell register-vehicle-page">
      <DashboardNavbar />
      <main className="register-vehicle-main">
        <div className="layout-page-inner">
          <div className="register-vehicle-hero-container">
            <PageHeroWithFilters
              title="Register Your Vehicle"
              subtitle="Add your vehicle to AutoSphere and start managing it digitally"
              button={{
                text: 'Back to My Vehicles',
                onClick: () => navigate('/dashboard/owner')
              }}
            />
          </div>

          <div className="register-vehicle-form-container">
          <form onSubmit={handleSubmit} className="register-vehicle-form">
            {/* Vehicle Identification Section */}
            <section className="form-section">
              <h2 className="section-title">Vehicle Identification</h2>
              
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="registration_number">
                    Registration Number <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="registration_number"
                    name="registration_number"
                    value={formData.registration_number}
                    onChange={handleInputChange}
                    placeholder="ABC-123"
                    required
                    className={errors.registration_number ? 'error' : ''}
                  />
                  {errors.registration_number && (
                    <span className="field-error">{errors.registration_number}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="chassis_number">
                    Chassis Number <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="chassis_number"
                    name="chassis_number"
                    value={formData.chassis_number}
                    onChange={handleInputChange}
                    placeholder="11-17 character chassis number"
                    required
                    className={errors.chassis_number ? 'error' : ''}
                    maxLength={17}
                  />
                  {errors.chassis_number && (
                    <span className="field-error">{errors.chassis_number}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="engine_number">
                    Engine Number <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="engine_number"
                    name="engine_number"
                    value={formData.engine_number}
                    onChange={handleInputChange}
                    placeholder="Engine number"
                    required
                    className={errors.engine_number ? 'error' : ''}
                    maxLength={50}
                  />
                  {errors.engine_number && (
                    <span className="field-error">{errors.engine_number}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="make">
                    Make <span className="required">*</span>
                  </label>
                  <select
                    id="make"
                    name="make"
                    value={formData.make}
                    onChange={handleInputChange}
                    required
                    className={errors.make ? 'error' : ''}
                  >
                    <option value="">Select Make</option>
                    {flatOptions.makes.map(make => (
                      <option key={make} value={make}>{make}</option>
                    ))}
                  </select>
                  {errors.make && (
                    <span className="field-error">{errors.make}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="model">
                    Model <span className="required">*</span>
                  </label>
                  <select
                    id="model"
                    name="model"
                    value={formData.model}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.make || availableOptions.models.length === 0}
                    className={errors.model ? 'error' : ''}
                  >
                    <option value="">{formData.make ? 'Select Model' : 'Select Make first'}</option>
                    {availableOptions.models.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                  {errors.model && (
                    <span className="field-error">{errors.model}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="variant">
                    Variant <span className="required">*</span>
                  </label>
                  <select
                    id="variant"
                    name="variant"
                    value={formData.variant}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.model || availableOptions.variants.length === 0}
                    className={errors.variant ? 'error' : ''}
                  >
                    <option value="">{formData.model ? (availableOptions.variants.length > 0 ? 'Select Variant' : 'No variants available') : 'Select Model first'}</option>
                    {availableOptions.variants.map(variant => (
                      <option key={variant} value={variant}>{variant}</option>
                    ))}
                  </select>
                  {errors.variant && (
                    <span className="field-error">{errors.variant}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="model_year">
                    Model Year <span className="required">*</span>
                  </label>
                  <select
                    id="model_year"
                    name="model_year"
                    value={formData.model_year}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.variant || availableOptions.years.length === 0}
                    className={errors.model_year ? 'error' : ''}
                  >
                    <option value="">{formData.variant ? (availableOptions.years.length > 0 ? 'Select Model Year' : 'No years available') : 'Select Variant first'}</option>
                    {[...availableOptions.years].sort((a, b) => parseInt(a) - parseInt(b)).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  {errors.model_year && (
                    <span className="field-error">{errors.model_year}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="transmission_type">
                    Transmission Type <span className="required">*</span>
                  </label>
                  <select
                    id="transmission_type"
                    name="transmission_type"
                    value={formData.transmission_type}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.model_year || availableOptions.transmissions.length === 0}
                    className={errors.transmission_type ? 'error' : ''}
                  >
                    <option value="">{formData.model_year ? (availableOptions.transmissions.length > 0 ? 'Select Transmission' : 'No transmissions available') : 'Select Model Year first'}</option>
                    {availableOptions.transmissions.map(transmission => (
                      <option key={transmission} value={normalizeTransmission(transmission)}>{transmission}</option>
                    ))}
                  </select>
                  {errors.transmission_type && (
                    <span className="field-error">{errors.transmission_type}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="assembly">
                    Assembly <span className="required">*</span>
                  </label>
                  <select
                    id="assembly"
                    name="assembly"
                    value={formData.assembly}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.transmission_type || availableOptions.assemblies.length === 0}
                    className={errors.assembly ? 'error' : ''}
                  >
                    <option value="">{formData.transmission_type ? (availableOptions.assemblies.length > 0 ? 'Select Assembly' : 'No assemblies available') : 'Select Transmission first'}</option>
                    {availableOptions.assemblies.map(assembly => (
                      <option key={assembly} value={assembly}>{assembly}</option>
                    ))}
                  </select>
                  {errors.assembly && (
                    <span className="field-error">{errors.assembly}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="engine_capacity">
                    Engine Capacity <span className="required">*</span>
                  </label>
                  <select
                    id="engine_capacity"
                    name="engine_capacity"
                    value={formData.engine_capacity}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.assembly || availableOptions.engine_capacities.length === 0}
                    className={errors.engine_capacity ? 'error' : ''}
                  >
                    <option value="">{formData.assembly ? (availableOptions.engine_capacities.length > 0 ? 'Select Engine Capacity' : 'No engine capacities available') : 'Select Assembly first'}</option>
                    {availableOptions.engine_capacities.map(engine => (
                      <option key={engine} value={engine}>{engine}</option>
                    ))}
                  </select>
                  {errors.engine_capacity && (
                    <span className="field-error">{errors.engine_capacity}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="body_type">
                    Body Type <span className="required">*</span>
                  </label>
                  <select
                    id="body_type"
                    name="body_type"
                    value={formData.body_type}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.engine_capacity || availableOptions.body_types.length === 0}
                    className={errors.body_type ? 'error' : ''}
                  >
                    <option value="">{formData.engine_capacity ? (availableOptions.body_types.length > 0 ? 'Select Body Type' : 'No body types available') : 'Select Engine Capacity first'}</option>
                    {availableOptions.body_types.map(bodyType => (
                      <option key={bodyType} value={bodyType}>{bodyType}</option>
                    ))}
                  </select>
                  {errors.body_type && (
                    <span className="field-error">{errors.body_type}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="fuel_type">
                    Fuel Type <span className="required">*</span>
                  </label>
                  <select
                    id="fuel_type"
                    name="fuel_type"
                    value={formData.fuel_type}
                    onChange={handleInputChange}
                    required
                    className={errors.fuel_type ? 'error' : ''}
                  >
                    <option value="petrol">Petrol</option>
                    <option value="diesel">Diesel</option>
                    <option value="cng">CNG</option>
                    <option value="lpg">LPG</option>
                    <option value="electric">Electric</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                  {errors.fuel_type && (
                    <span className="field-error">{errors.fuel_type}</span>
                  )}
                </div>


              </div>
            </section>

            {/* Vehicle Attributes Section */}
            <section className="form-section">
              <h2 className="section-title">Vehicle Attributes</h2>
              
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="mileage_km">Mileage (km)</label>
                  <input
                    type="number"
                    id="mileage_km"
                    name="mileage_km"
                    value={formData.mileage_km}
                    onChange={handleInputChange}
                    placeholder="e.g., 50000"
                    min="0"
                    className={errors.mileage_km ? 'error' : ''}
                  />
                  {errors.mileage_km && (
                    <span className="field-error">{errors.mileage_km}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="color">Color</label>
                  <select
                    id="color"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    className={errors.color ? 'error' : ''}
                  >
                    <option value="">Select Color</option>
                    {flatOptions.colors.map(color => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                  {errors.color && (
                    <span className="field-error">{errors.color}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="registered_city">Registered City</label>
                  <select
                    id="registered_city"
                    name="registered_city"
                    value={formData.registered_city}
                    onChange={handleInputChange}
                    className={errors.registered_city ? 'error' : ''}
                  >
                    <option value="">Select Registered City</option>
                    {flatOptions.registeredCities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                  {errors.registered_city && (
                    <span className="field-error">{errors.registered_city}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="purchase_date">Purchase Date</label>
                  <input
                    type="date"
                    id="purchase_date"
                    name="purchase_date"
                    value={formData.purchase_date}
                    onChange={handleInputChange}
                    max={new Date().toISOString().split('T')[0]}
                    className={errors.purchase_date ? 'error' : ''}
                  />
                  {errors.purchase_date && (
                    <span className="field-error">{errors.purchase_date}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Vehicle Images Section – same card layout as Damage Detection / Create Auction */}
            <section className="form-section">
              <h2 className="section-title">Vehicle Images</h2>
              <p className="section-hint">Front, back, and interior views. JPG, PNG (Max 5MB each).</p>
              <div className="vehicle-images-grid">
                <div className="vehicle-image-slot">
                  <label htmlFor="front_image">Front View</label>
                  <input
                    ref={frontImageInputRef}
                    type="file"
                    id="front_image"
                    accept=".jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange('front_image', e)}
                    className="file-input-hidden"
                  />
                  <div
                    className={`image-dropzone ${dragOverField === 'front_image' ? 'is-dragover' : ''} ${errors.front_image ? 'has-error' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => frontImageInputRef.current?.click()}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? frontImageInputRef.current?.click() : null)}
                    {...makeDropHandlers('front_image')}
                    aria-label="Upload front view image"
                  >
                    {files.front_image && imagePreviewUrls.front_image ? (
                      <div className="image-preview-item">
                        <img src={imagePreviewUrls.front_image} alt="Front" className="preview-image" />
                        <span className="image-number">1</span>
                        <button type="button" className="remove-image-btn" onClick={(e) => { e.stopPropagation(); removeFile('front_image'); }} aria-label="Remove front image">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="image-dropzone-inner">
                        <Upload size={20} aria-hidden="true" />
                        <div className="image-dropzone-text">
                          <div className="image-dropzone-title">Drag & drop</div>
                          <div className="image-dropzone-subtitle">or click to upload</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {errors.front_image && <span className="field-error">{errors.front_image}</span>}
                </div>
                <div className="vehicle-image-slot">
                  <label htmlFor="back_image">Back View</label>
                  <input
                    ref={backImageInputRef}
                    type="file"
                    id="back_image"
                    accept=".jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange('back_image', e)}
                    className="file-input-hidden"
                  />
                  <div
                    className={`image-dropzone ${dragOverField === 'back_image' ? 'is-dragover' : ''} ${errors.back_image ? 'has-error' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => backImageInputRef.current?.click()}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? backImageInputRef.current?.click() : null)}
                    {...makeDropHandlers('back_image')}
                    aria-label="Upload back view image"
                  >
                    {files.back_image && imagePreviewUrls.back_image ? (
                      <div className="image-preview-item">
                        <img src={imagePreviewUrls.back_image} alt="Back" className="preview-image" />
                        <span className="image-number">2</span>
                        <button type="button" className="remove-image-btn" onClick={(e) => { e.stopPropagation(); removeFile('back_image'); }} aria-label="Remove back image">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="image-dropzone-inner">
                        <Upload size={20} aria-hidden="true" />
                        <div className="image-dropzone-text">
                          <div className="image-dropzone-title">Drag & drop</div>
                          <div className="image-dropzone-subtitle">or click to upload</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {errors.back_image && <span className="field-error">{errors.back_image}</span>}
                </div>
                <div className="vehicle-image-slot">
                  <label htmlFor="interior_image">Interior View</label>
                  <input
                    ref={interiorImageInputRef}
                    type="file"
                    id="interior_image"
                    accept=".jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange('interior_image', e)}
                    className="file-input-hidden"
                  />
                  <div
                    className={`image-dropzone ${dragOverField === 'interior_image' ? 'is-dragover' : ''} ${errors.interior_image ? 'has-error' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => interiorImageInputRef.current?.click()}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? interiorImageInputRef.current?.click() : null)}
                    {...makeDropHandlers('interior_image')}
                    aria-label="Upload interior view image"
                  >
                    {files.interior_image && imagePreviewUrls.interior_image ? (
                      <div className="image-preview-item">
                        <img src={imagePreviewUrls.interior_image} alt="Interior" className="preview-image" />
                        <span className="image-number">3</span>
                        <button type="button" className="remove-image-btn" onClick={(e) => { e.stopPropagation(); removeFile('interior_image'); }} aria-label="Remove interior image">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="image-dropzone-inner">
                        <Upload size={20} aria-hidden="true" />
                        <div className="image-dropzone-text">
                          <div className="image-dropzone-title">Drag & drop</div>
                          <div className="image-dropzone-subtitle">or click to upload</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {errors.interior_image && <span className="field-error">{errors.interior_image}</span>}
                </div>
              </div>
            </section>

            {/* Documents — same dropzone UX as Vehicle Images (Upload + Drag & drop + or click to upload) */}
            <section className="form-section">
              <h2 className="section-title">Documents</h2>
              <p className="section-hint">{DOCUMENT_ACCEPT_LABEL} (max 10MB each).</p>

              <div className="register-documents-grid">
                <div className="vehicle-image-slot">
                  <label htmlFor="registration_certificate">
                    Registration certificate <span className="required">*</span>
                  </label>
                  <input
                    ref={registrationCertInputRef}
                    type="file"
                    id="registration_certificate"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => handleFileChange('registration_certificate', e)}
                    className="file-input-hidden"
                  />
                  <div
                    className={`image-dropzone ${dragOverField === 'registration_certificate' ? 'is-dragover' : ''} ${errors.registration_certificate ? 'has-error' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => registrationCertInputRef.current?.click()}
                    onKeyDown={(e) =>
                      e.key === 'Enter' || e.key === ' ' ? registrationCertInputRef.current?.click() : null
                    }
                    {...registrationCertificateDropHandlers}
                    aria-label="Upload registration certificate"
                  >
                    {files.registration_certificate ? (
                      <div className="image-preview-item register-document-preview-item">
                        <div className="register-document-preview-body">
                          <FileText size={36} strokeWidth={1.5} aria-hidden="true" />
                          <span className="register-document-preview-filename" title={files.registration_certificate.name}>
                            {files.registration_certificate.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="remove-image-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile('registration_certificate');
                          }}
                          aria-label="Remove registration certificate"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="image-dropzone-inner">
                        <Upload size={20} aria-hidden="true" />
                        <div className="image-dropzone-text">
                          <div className="image-dropzone-title">Drag & drop</div>
                          <div className="image-dropzone-subtitle">or click to upload</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {errors.registration_certificate && (
                    <span className="field-error">{errors.registration_certificate}</span>
                  )}
                </div>

                <div className="vehicle-image-slot">
                  <label htmlFor="additional_documents">
                    Other documents <span className="register-document-optional">(Optional)</span>
                  </label>
                  <input
                    ref={additionalDocsInputRef}
                    type="file"
                    id="additional_documents"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    multiple
                    onChange={(e) => handleFileChange('additional_documents', e)}
                    className="file-input-hidden"
                  />
                  <div
                    className={`image-dropzone ${dragOverField === 'additional_documents' ? 'is-dragover' : ''} ${files.additional_documents.length > 0 ? 'register-additional-has-files' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => additionalDocsInputRef.current?.click()}
                    onKeyDown={(e) =>
                      e.key === 'Enter' || e.key === ' ' ? additionalDocsInputRef.current?.click() : null
                    }
                    {...additionalDocumentsDropHandlers}
                    aria-label="Upload additional documents"
                  >
                    {files.additional_documents.length > 0 ? (
                      <div className="register-additional-docs-list">
                        {files.additional_documents.map((file, index) => (
                          <div key={`${file.name}-${index}`} className="register-additional-docs-row">
                            <span className="register-additional-docs-name" title={file.name}>
                              {file.name}
                            </span>
                            <button
                              type="button"
                              className="remove-file-btn register-additional-docs-remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile('additional_documents', index);
                              }}
                              aria-label={`Remove ${file.name}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="image-dropzone-inner">
                        <Upload size={20} aria-hidden="true" />
                        <div className="image-dropzone-text">
                          <div className="image-dropzone-title">Drag & drop</div>
                          <div className="image-dropzone-subtitle">or click to upload</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Form Actions */}
            <div className="form-actions ui-form-actions">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary ui-btn-primary"
              >
                {loading ? 'Registering...' : 'Register Vehicle'}
              </button>
            </div>
          </form>
        </div>
        </div>
      </main>
    </div>
  );
};

export default RegisterVehiclePage;

