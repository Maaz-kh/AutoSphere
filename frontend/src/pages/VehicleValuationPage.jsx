import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import { predictVehiclePrice } from '../services/valuation-api';
import useVehicleCascading from '../hooks/useVehicleCascading';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import PriceRangeBar from '../components/PriceRangeBar';
import '../styles/VehicleValuationPage.css';

const VehicleValuationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const vehicleFromState = location.state?.vehicle;
  const hasPrefilled = useRef(false);

  const [predicting, setPredicting] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    make: '',
    model: '',
    variant: '',
    model_year: '',
    mileage: '',
    transmission_type: '',
    registered_in: '',
    engine_capacity: '',
    exterior_condition: 'Not Specified',
    assembly: '',
    body_type: ''
  });

  // Use cascading hook for vehicle data
  const { availableOptions, flatOptions } = useVehicleCascading(formData, setFormData);

  // Exterior condition options
  const exteriorConditions = [
    'Excellent/Genuine',
    'Minor Touchup',
    'Repainted/Painted',
    'Accident/Damaged',
    'Inner Genuine Only',
    'Not Specified'
  ];

  // Helper functions for normalization (shared across component)
  const normalizeTransmission = (transmission) => {
    if (!transmission) return '';
    const t = transmission.toLowerCase();
    return t === 'manual' ? 'Manual' : t === 'automatic' ? 'Automatic' : transmission;
  };

  const normalizeAssembly = (assembly) => {
    if (!assembly) return '';
    const a = assembly.toLowerCase();
    return a === 'local' ? 'Local' : a === 'imported' ? 'Imported' : assembly;
  };

  // Fetch user's vehicles for dropdown optimization
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const res = await apiClient.get('/vehicles');
        setVehicles(res.data?.data || []);
      } catch (error) {
        console.error('Failed to load vehicles:', error);
      }
    };
    fetchVehicles();
  }, []);

  // Store pre-fill data in a ref to persist across renders
  const prefillDataRef = useRef(null);
  const reappliedRef = useRef(false);

  // Pre-fill form if vehicle passed from state
  useEffect(() => {
    if (vehicleFromState) {
      const vehicleId = vehicleFromState.chassis_number || vehicleFromState.id;
      const lastPrefilledId = hasPrefilled.current;
      
      // Only pre-fill if this is a different vehicle or we haven't pre-filled yet
      if (vehicleId !== lastPrefilledId) {
        // Check if form is empty (to avoid overwriting user changes)
        const isFormEmpty = !formData.make && !formData.model && !formData.variant;
        
        if (isFormEmpty) {
          // Store pre-fill data for later use
          prefillDataRef.current = {
            make: vehicleFromState.make || '',
            model: vehicleFromState.model || '',
            variant: vehicleFromState.variant || '',
            model_year: vehicleFromState.model_year?.toString() || '',
            mileage: vehicleFromState.mileage_km?.toString() || '',
            transmission_type: normalizeTransmission(vehicleFromState.transmission_type),
            registered_in: vehicleFromState.registered_city || '',
            engine_capacity: vehicleFromState.engine_capacity?.toString() || '',
            exterior_condition: 'Not Specified',
            assembly: normalizeAssembly(vehicleFromState.assembly),
            body_type: vehicleFromState.body_type || ''
          };
          
          // Reset re-apply flag
          reappliedRef.current = false;
          
          // Set all fields at once
          setFormData(prefillDataRef.current);
          hasPrefilled.current = vehicleId;
        }
      }
    } else {
      prefillDataRef.current = null;
      reappliedRef.current = false;
    }
  }, [vehicleFromState]);

  // Re-apply pre-filled values progressively as cascading hook enables fields
  useEffect(() => {
    if (prefillDataRef.current && hasPrefilled.current) {
      const needsUpdate = {};
      let shouldUpdate = false;

      // Check each cascading level and re-apply if needed
      if (formData.make === prefillDataRef.current.make) {
        if (!formData.model && prefillDataRef.current.model) {
          needsUpdate.model = prefillDataRef.current.model;
          shouldUpdate = true;
        }
        
        if (formData.model === prefillDataRef.current.model) {
          if (!formData.variant && prefillDataRef.current.variant) {
            needsUpdate.variant = prefillDataRef.current.variant;
            shouldUpdate = true;
          }
          
          if (formData.variant === prefillDataRef.current.variant) {
            if (!formData.model_year && prefillDataRef.current.model_year) {
              needsUpdate.model_year = prefillDataRef.current.model_year;
              shouldUpdate = true;
            }
            
            if (formData.model_year === prefillDataRef.current.model_year) {
              if (!formData.transmission_type && prefillDataRef.current.transmission_type) {
                needsUpdate.transmission_type = prefillDataRef.current.transmission_type;
                shouldUpdate = true;
              }
              
              if (formData.transmission_type === prefillDataRef.current.transmission_type) {
                if (!formData.assembly && prefillDataRef.current.assembly) {
                  needsUpdate.assembly = prefillDataRef.current.assembly;
                  shouldUpdate = true;
                }
                
                if (formData.assembly === prefillDataRef.current.assembly) {
                  if (!formData.engine_capacity && prefillDataRef.current.engine_capacity) {
                    needsUpdate.engine_capacity = prefillDataRef.current.engine_capacity;
                    shouldUpdate = true;
                  }
                  
                  if (formData.engine_capacity === prefillDataRef.current.engine_capacity) {
                    if (!formData.body_type && prefillDataRef.current.body_type) {
                      needsUpdate.body_type = prefillDataRef.current.body_type;
                      shouldUpdate = true;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Apply updates if needed
      if (shouldUpdate) {
        setFormData(prev => ({
          ...prev,
          ...needsUpdate
        }));
      }
    }
  }, [
    formData.make,
    formData.model,
    formData.variant,
    formData.model_year,
    formData.transmission_type,
    formData.assembly,
    formData.engine_capacity
  ]);

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
    // Clear prediction when form changes
    if (prediction) {
      setPrediction(null);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.make) newErrors.make = 'Make is required';
    if (!formData.model) newErrors.model = 'Model is required';
    if (!formData.variant) newErrors.variant = 'Variant is required';
    if (!formData.model_year) newErrors.model_year = 'Model year is required';
    if (!formData.mileage) newErrors.mileage = 'Mileage is required';
    if (!formData.transmission_type) newErrors.transmission_type = 'Transmission type is required';
    if (!formData.registered_in) newErrors.registered_in = 'Registration city is required';
    if (!formData.engine_capacity) newErrors.engine_capacity = 'Engine capacity is required';
    if (!formData.assembly) newErrors.assembly = 'Assembly is required';
    if (!formData.body_type) newErrors.body_type = 'Body type is required';

    // Validate numeric fields
    if (formData.model_year && (isNaN(formData.model_year) || formData.model_year < 1990 || formData.model_year > 2026)) {
      newErrors.model_year = 'Model year must be between 1990 and 2026';
    }
    if (formData.mileage && (isNaN(formData.mileage) || formData.mileage < 0 || formData.mileage > 500000)) {
      newErrors.mileage = 'Mileage must be between 0 and 500,000 km';
    }
    if (formData.engine_capacity && (isNaN(formData.engine_capacity) || formData.engine_capacity < 500 || formData.engine_capacity > 8000)) {
      newErrors.engine_capacity = 'Engine capacity must be between 500 and 8,000 cc';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fill in all required fields correctly');
      return;
    }

    try {
      setPredicting(true);
      setPrediction(null);

      // Prepare data for API
      const payload = {
        model: `${formData.make} ${formData.model}`,
        variant: formData.variant,
        model_year: parseInt(formData.model_year, 10),
        mileage: parseFloat(formData.mileage),
        transmission_type: formData.transmission_type,
        registered_in: formData.registered_in,
        engine_capacity: parseFloat(formData.engine_capacity),
        exterior_condition: formData.exterior_condition,
        assembly: formData.assembly,
        body_type: formData.body_type
      };

      const result = await predictVehiclePrice(payload);
      setPrediction(result);
      toast.success('Valuation completed successfully');
      
      // Scroll to results after a brief delay to ensure DOM is updated
      setTimeout(() => {
        const resultsElement = document.querySelector('.valuation-results');
        if (resultsElement) {
          resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      console.error('Valuation error:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || 'Failed to get vehicle valuation. Please try again.';
      toast.error(errorMsg);
    } finally {
      setPredicting(false);
    }
  };

  const formatPrice = (price) => {
    if (price >= 1000000) {
      return `PKR ${(price / 100000).toFixed(1)} Lacs`;
    }
    return `PKR ${price.toLocaleString()}`;
  };

  // Parse price range string to extract min and max values
  // Handles formats like "PKR 14.9 Lacs - PKR 18.5 Lacs" or "14.9 Lacs - 18.5 Lacs"
  const parsePriceRange = (priceRangeString) => {
    if (!priceRangeString) return { min: null, max: null };

    // Extract numbers and "Lacs" or "Lakhs"
    const match = priceRangeString.match(/(\d+\.?\d*)\s*(?:Lacs?|Lakhs?)/gi);
    
    if (match && match.length >= 2) {
      const minLacs = parseFloat(match[0].match(/\d+\.?\d*/)[0]);
      const maxLacs = parseFloat(match[1].match(/\d+\.?\d*/)[0]);
      
      return {
        min: minLacs * 100000, // Convert to actual price
        max: maxLacs * 100000
      };
    }

    // Fallback: try to extract any numbers
    const numbers = priceRangeString.match(/\d+\.?\d*/g);
    if (numbers && numbers.length >= 2) {
      const minLacs = parseFloat(numbers[0]);
      const maxLacs = parseFloat(numbers[1]);
      
      // Assume they're in Lacs if values are reasonable
      if (minLacs < 1000 && maxLacs < 1000) {
        return {
          min: minLacs * 100000,
          max: maxLacs * 100000
        };
      }
      
      return {
        min: minLacs,
        max: maxLacs
      };
    }

    return { min: null, max: null };
  };

  // If accessed manually, use all available options from cascading hook
  const filteredOptions = useMemo(() => {
    // If accessed manually (no vehicleFromState), use all available options from cascading hook
    if (!vehicleFromState) {
      // Sort years in ascending order
      const sortedYears = availableOptions.years 
        ? [...availableOptions.years].sort((a, b) => parseInt(a) - parseInt(b))
        : [];
      
      return {
        makes: flatOptions.makes || [],
        models: availableOptions.models || [],
        variants: availableOptions.variants || [],
        years: sortedYears,
        transmissions: availableOptions.transmissions || [],
        assemblies: availableOptions.assemblies || [],
        engine_capacities: availableOptions.engine_capacities || [],
        body_types: availableOptions.body_types || []
      };
    }

    // If accessed from card (vehicleFromState exists), filter by registered vehicles
    // Get current values from formData or vehicleFromState (for pre-fill support)
    const currentMake = formData.make || (vehicleFromState?.make);
    const currentModel = formData.model || (vehicleFromState?.model);
    const currentVariant = formData.variant || (vehicleFromState?.variant);
    const currentYear = formData.model_year || (vehicleFromState?.model_year?.toString());
    const currentTransmission = formData.transmission_type || normalizeTransmission(vehicleFromState?.transmission_type);
    const currentAssembly = formData.assembly || normalizeAssembly(vehicleFromState?.assembly);
    const currentCapacity = formData.engine_capacity || (vehicleFromState?.engine_capacity?.toString());
    
    // If no vehicles, but we have a pre-filled vehicle, include its values
    if (vehicles.length === 0) {
      if (vehicleFromState) {
        // Include pre-filled vehicle's values so they can be displayed
        return {
          makes: vehicleFromState.make ? [vehicleFromState.make] : [],
          models: vehicleFromState.model ? [vehicleFromState.model] : [],
          variants: vehicleFromState.variant ? [vehicleFromState.variant] : [],
          years: vehicleFromState.model_year ? [vehicleFromState.model_year.toString()] : [],
          transmissions: vehicleFromState.transmission_type ? [normalizeTransmission(vehicleFromState.transmission_type)] : [],
          assemblies: vehicleFromState.assembly ? [normalizeAssembly(vehicleFromState.assembly)] : [],
          engine_capacities: vehicleFromState.engine_capacity ? [vehicleFromState.engine_capacity.toString()] : [],
          body_types: vehicleFromState.body_type ? [vehicleFromState.body_type] : []
        };
      }
      // No vehicles and no pre-filled vehicle
      return {
        makes: [],
        models: [],
        variants: [],
        years: [],
        transmissions: [],
        assemblies: [],
        engine_capacities: [],
        body_types: []
      };
    }

    // Filter makes - only from user's vehicles
    const userMakes = [...new Set(vehicles.map(v => v.make).filter(Boolean))];
    
    // If we have a pre-filled vehicle, ensure its make is included
    if (vehicleFromState?.make && !userMakes.includes(vehicleFromState.make)) {
      userMakes.push(vehicleFromState.make);
    }

    // Filter models - only from user's vehicles for selected make
    // Include pre-filled model if it exists (for pre-fill scenario)
    let userModels = [];
    if (currentMake) {
      userModels = [
        ...new Set(
          vehicles
            .filter(v => v.make === currentMake)
            .map(v => v.model)
            .filter(Boolean)
        )
      ];
      // If model is pre-filled but not in filtered list, add it
      const prefillModel = formData.model || vehicleFromState?.model;
      if (prefillModel && !userModels.includes(prefillModel)) {
        userModels.push(prefillModel);
      }
    }

    // Filter variants - only from user's vehicles for selected make+model
    // Include pre-filled variant if it exists
    let userVariants = [];
    if (currentMake && currentModel) {
      userVariants = [
        ...new Set(
          vehicles
            .filter(v => v.make === currentMake && v.model === currentModel)
            .map(v => v.variant)
            .filter(Boolean)
        )
      ];
      // If variant is pre-filled but not in filtered list, add it
      const prefillVariant = formData.variant || vehicleFromState?.variant;
      if (prefillVariant && !userVariants.includes(prefillVariant)) {
        userVariants.push(prefillVariant);
      }
    }

    // Filter years - only from user's vehicles for selected make+model+variant
    // Include pre-filled year if it exists
    let userYears = [];
    if (currentMake && currentModel && currentVariant) {
      userYears = [
        ...new Set(
          vehicles
            .filter(
              v =>
                v.make === currentMake &&
                v.model === currentModel &&
                v.variant === currentVariant
            )
            .map(v => v.model_year?.toString())
            .filter(Boolean)
        )
      ].sort((a, b) => parseInt(a) - parseInt(b)); // Sort ascending
      // If year is pre-filled but not in filtered list, add it
      const prefillYear = formData.model_year || (vehicleFromState?.model_year?.toString());
      if (prefillYear && !userYears.includes(prefillYear)) {
        userYears.push(prefillYear);
        userYears.sort((a, b) => parseInt(a) - parseInt(b));
      }
    }

    // Filter transmissions - only from user's vehicles for selected make+model+variant+year
    // Include pre-filled transmission if it exists
    let userTransmissions = [];
    if (currentMake && currentModel && currentVariant && currentYear) {
      userTransmissions = [
        ...new Set(
          vehicles
            .filter(
              v =>
                v.make === currentMake &&
                v.model === currentModel &&
                v.variant === currentVariant &&
                v.model_year?.toString() === currentYear
            )
            .map(v => normalizeTransmission(v.transmission_type))
            .filter(Boolean)
        )
      ];
      // If transmission is pre-filled but not in filtered list, add it
      const prefillTransmission = formData.transmission_type || normalizeTransmission(vehicleFromState?.transmission_type);
      if (prefillTransmission && !userTransmissions.includes(prefillTransmission)) {
        userTransmissions.push(prefillTransmission);
      }
    }

    // Filter assemblies - only from user's vehicles for selected path
    // Include pre-filled assembly if it exists
    let userAssemblies = [];
    if (currentMake && currentModel && currentVariant && currentYear && currentTransmission) {
      userAssemblies = [
        ...new Set(
          vehicles
            .filter(
              v =>
                v.make === currentMake &&
                v.model === currentModel &&
                v.variant === currentVariant &&
                v.model_year?.toString() === currentYear &&
                normalizeTransmission(v.transmission_type) === currentTransmission
            )
            .map(v => normalizeAssembly(v.assembly))
            .filter(Boolean)
        )
      ];
      // If assembly is pre-filled but not in filtered list, add it
      const prefillAssembly = formData.assembly || normalizeAssembly(vehicleFromState?.assembly);
      if (prefillAssembly && !userAssemblies.includes(prefillAssembly)) {
        userAssemblies.push(prefillAssembly);
      }
    }

    // Filter engine capacities - only from user's vehicles for selected path
    // Include pre-filled engine capacity if it exists
    let userEngineCapacities = [];
    if (currentMake && currentModel && currentVariant && currentYear && currentTransmission && currentAssembly) {
      userEngineCapacities = [
        ...new Set(
          vehicles
            .filter(
              v =>
                v.make === currentMake &&
                v.model === currentModel &&
                v.variant === currentVariant &&
                v.model_year?.toString() === currentYear &&
                normalizeTransmission(v.transmission_type) === currentTransmission &&
                normalizeAssembly(v.assembly) === currentAssembly
            )
            .map(v => v.engine_capacity?.toString())
            .filter(Boolean)
        )
      ];
      // If engine capacity is pre-filled but not in filtered list, add it
      const prefillCapacity = formData.engine_capacity || (vehicleFromState?.engine_capacity?.toString());
      if (prefillCapacity && !userEngineCapacities.includes(prefillCapacity)) {
        userEngineCapacities.push(prefillCapacity);
      }
    }

    // Filter body types - only from user's vehicles for selected path
    // Include pre-filled body type if it exists
    let userBodyTypes = [];
    if (currentMake && currentModel && currentVariant && currentYear && currentTransmission && currentAssembly && currentCapacity) {
      userBodyTypes = [
        ...new Set(
          vehicles
            .filter(
              v =>
                v.make === currentMake &&
                v.model === currentModel &&
                v.variant === currentVariant &&
                v.model_year?.toString() === currentYear &&
                normalizeTransmission(v.transmission_type) === currentTransmission &&
                normalizeAssembly(v.assembly) === currentAssembly &&
                v.engine_capacity?.toString() === currentCapacity
            )
            .map(v => v.body_type)
            .filter(Boolean)
        )
      ];
      // If body type is pre-filled but not in filtered list, add it
      const prefillBodyType = formData.body_type || (vehicleFromState?.body_type);
      if (prefillBodyType && !userBodyTypes.includes(prefillBodyType)) {
        userBodyTypes.push(prefillBodyType);
      }
    }

    return {
      makes: userMakes,
      models: userModels,
      variants: userVariants,
      years: userYears,
      transmissions: userTransmissions,
      assemblies: userAssemblies,
      engine_capacities: userEngineCapacities,
      body_types: userBodyTypes
    };
  }, [
    vehicles,
    formData.make,
    formData.model,
    formData.variant,
    formData.model_year,
    formData.transmission_type,
    formData.assembly,
    formData.engine_capacity,
    vehicleFromState,
    availableOptions,
    flatOptions
  ]);

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="valuation-main">
        <div className="layout-page-inner valuation-container">
          <PageHeroWithFilters
            title="Vehicle Valuation"
            subtitle="Get an AI-powered price estimate for your vehicle based on market data"
            button={{
              text: 'Back to My Vehicles',
              onClick: () => navigate('/dashboard/owner')
            }}
            filters={[]}
          />

          <div className="valuation-content">
            <form className="valuation-form" onSubmit={handleSubmit}>
              <div className="form-section">
                <h3 className="form-section-title">Vehicle Information</h3>
                <div className="form-grid">
                  {/* Cascading Fields - Grouped Together */}
                  <div className="form-group">
                    <label htmlFor="make">
                      Make <span className="required">*</span>
                    </label>
                    <select
                      id="make"
                      name="make"
                      value={formData.make}
                      onChange={handleInputChange}
                      className={errors.make ? 'error' : ''}
                    >
                      <option value="">Select Make</option>
                      {filteredOptions.makes.map(make => (
                        <option key={make} value={make}>{make}</option>
                      ))}
                    </select>
                    {errors.make && <span className="error-message">{errors.make}</span>}
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
                      disabled={!formData.make}
                      className={errors.model ? 'error' : ''}
                    >
                      <option value="">{formData.make ? 'Select Model' : 'Select Make first'}</option>
                      {filteredOptions.models.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                    {errors.model && <span className="error-message">{errors.model}</span>}
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
                      disabled={!formData.model}
                      className={errors.variant ? 'error' : ''}
                    >
                      <option value="">{formData.model ? 'Select Variant' : 'Select Model first'}</option>
                      {filteredOptions.variants.map(variant => (
                        <option key={variant} value={variant}>{variant}</option>
                      ))}
                    </select>
                    {errors.variant && <span className="error-message">{errors.variant}</span>}
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
                      disabled={!formData.variant}
                      className={errors.model_year ? 'error' : ''}
                    >
                      <option value="">{formData.variant ? 'Select Model Year' : 'Select Variant first'}</option>
                      {filteredOptions.years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    {errors.model_year && <span className="error-message">{errors.model_year}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="transmission_type">
                      Transmission <span className="required">*</span>
                    </label>
                    <select
                      id="transmission_type"
                      name="transmission_type"
                      value={formData.transmission_type}
                      onChange={handleInputChange}
                      disabled={!formData.model_year}
                      className={errors.transmission_type ? 'error' : ''}
                    >
                      <option value="">{formData.model_year ? 'Select Transmission' : 'Select Model Year first'}</option>
                      {filteredOptions.transmissions.map(transmission => (
                        <option key={transmission} value={transmission}>{transmission}</option>
                      ))}
                    </select>
                    {errors.transmission_type && <span className="error-message">{errors.transmission_type}</span>}
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
                      disabled={!formData.transmission_type}
                      className={errors.assembly ? 'error' : ''}
                    >
                      <option value="">{formData.transmission_type ? 'Select Assembly' : 'Select Transmission first'}</option>
                      {filteredOptions.assemblies.map(assembly => (
                        <option key={assembly} value={assembly}>{assembly}</option>
                      ))}
                    </select>
                    {errors.assembly && <span className="error-message">{errors.assembly}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="engine_capacity">
                      Engine Capacity (cc) <span className="required">*</span>
                    </label>
                    <select
                      id="engine_capacity"
                      name="engine_capacity"
                      value={formData.engine_capacity}
                      onChange={handleInputChange}
                      disabled={!formData.assembly}
                      className={errors.engine_capacity ? 'error' : ''}
                    >
                      <option value="">{formData.assembly ? 'Select Engine Capacity' : 'Select Assembly first'}</option>
                      {filteredOptions.engine_capacities.map(capacity => (
                        <option key={capacity} value={capacity}>{capacity} cc</option>
                      ))}
                    </select>
                    {errors.engine_capacity && <span className="error-message">{errors.engine_capacity}</span>}
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
                      disabled={!formData.engine_capacity}
                      className={errors.body_type ? 'error' : ''}
                    >
                      <option value="">{formData.engine_capacity ? 'Select Body Type' : 'Select Engine Capacity first'}</option>
                      {filteredOptions.body_types.map(bodyType => (
                        <option key={bodyType} value={bodyType}>{bodyType}</option>
                      ))}
                    </select>
                    {errors.body_type && <span className="error-message">{errors.body_type}</span>}
                  </div>

                  {/* Non-Cascading Fields */}
                  <div className="form-group">
                    <label htmlFor="mileage">
                      Mileage (km) <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      id="mileage"
                      name="mileage"
                      value={formData.mileage}
                      onChange={handleInputChange}
                      placeholder="e.g., 50000"
                      min="0"
                      max="500000"
                      className={errors.mileage ? 'error' : ''}
                    />
                    {errors.mileage && <span className="error-message">{errors.mileage}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="registered_in">
                      Registered In <span className="required">*</span>
                    </label>
                    <select
                      id="registered_in"
                      name="registered_in"
                      value={formData.registered_in}
                      onChange={handleInputChange}
                      className={errors.registered_in ? 'error' : ''}
                    >
                      <option value="">Select City</option>
                      {flatOptions.registeredCities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    {errors.registered_in && <span className="error-message">{errors.registered_in}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="exterior_condition">
                      Exterior Condition <span className="required">*</span>
                    </label>
                    <select
                      id="exterior_condition"
                      name="exterior_condition"
                      value={formData.exterior_condition}
                      onChange={handleInputChange}
                    >
                      {exteriorConditions.map(condition => (
                        <option key={condition} value={condition}>{condition}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={predicting}
                >
                  {predicting ? 'Getting Valuation...' : 'Get Valuation'}
                </button>
              </div>
            </form>

            {prediction && (() => {
              // Try to get min/max from API response first, then parse from price_range string
              let minPrice = prediction.min_price || prediction.minPrice;
              let maxPrice = prediction.max_price || prediction.maxPrice;
              
              // If not available, try parsing from price_range string
              if (!minPrice || !maxPrice) {
                const parsed = parsePriceRange(prediction.price_range);
                minPrice = parsed.min;
                maxPrice = parsed.max;
              }

              const predictedPrice = Number(prediction.predicted_price);
              const numericMinPrice = minPrice != null ? Number(minPrice) : null;
              const numericMaxPrice = maxPrice != null ? Number(maxPrice) : null;
              const displayPredictedPrice = Number.isFinite(predictedPrice)
                ? predictedPrice
                : prediction.predicted_price;
              
              const hasValidRange =
                Number.isFinite(predictedPrice) &&
                Number.isFinite(numericMinPrice) &&
                Number.isFinite(numericMaxPrice);
              
              return (
                <div className="valuation-results" id="valuation-results">
                  <h3 className="results-title">Valuation Results</h3>
                  
                  {hasValidRange ? (
                    <PriceRangeBar
                      predictedPrice={predictedPrice}
                      minPrice={numericMinPrice}
                      maxPrice={numericMaxPrice}
                      formatPrice={formatPrice}
                    />
                  ) : (
                    <div className="results-card">
                      <div className="result-item main-price">
                        <span className="result-label">Predicted Price</span>
                        <span className="result-value">{formatPrice(displayPredictedPrice)}</span>
                      </div>
                      {prediction.price_range && (
                        <div className="result-item">
                          <span className="result-label">Price Range</span>
                          <span className="result-value">{prediction.price_range}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional Information (Market Position + Recommendation — commented out)
                  <div className="results-additional-info">
                    {prediction.market_position && (
                      <div className="result-item">
                        <span className="result-label">Market Position</span>
                        <span className={`result-value ${prediction.market_position.toLowerCase().includes('above') ? 'positive' : prediction.market_position.toLowerCase().includes('below') ? 'negative' : ''}`}>
                          {prediction.market_position}
                        </span>
                      </div>
                    )}

                    {prediction.recommendation && (
                      <div className="result-item recommendation">
                        <span className="result-label">Recommendation</span>
                        <span className="result-value">{prediction.recommendation}</span>
                      </div>
                    )}
                  </div>
                  */}
                </div>
              );
            })()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default VehicleValuationPage;

