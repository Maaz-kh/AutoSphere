import { useState, useEffect, useMemo } from 'react';
import vehicleData from '../data/vehicle_cascading_data.json';

/**
 * Custom hook for managing vehicle cascading dropdown logic
 * Handles all 8 levels of cascading: Make → Model → Variant → Year → Transmission → Assembly → Engine Capacity → Body Type
 */
const useVehicleCascading = (formData, setFormData) => {
  const [availableOptions, setAvailableOptions] = useState({
    models: [],
    variants: [],
    years: [],
    transmissions: [],
    assemblies: [],
    engine_capacities: [],
    body_types: []
  });

  // Memoize flat options (don't change)
  const flatOptions = useMemo(() => ({
    makes: vehicleData?.makes || [],
    colors: vehicleData?.color_options || [],
    registeredCities: vehicleData?.registered_in_options || []
  }), []);

  // Reset dependent fields helper
  const resetDependentFields = (fieldsToReset) => {
    setFormData(prev => {
      const updated = { ...prev };
      fieldsToReset.forEach(field => {
        updated[field] = '';
      });
      return updated;
    });
  };

  // Helper to convert backend transmission format to JSON key format
  // Backend uses: "manual", "automatic"
  // JSON uses: "Manual", "Automatic"
  const getTransmissionKeyForJSON = (transmissionValue) => {
    if (!transmissionValue) return null;
    if (transmissionValue.toLowerCase() === 'manual') return 'Manual';
    if (transmissionValue.toLowerCase() === 'automatic') return 'Automatic';
    return transmissionValue;
  };

  // Level 1: Make → Models
  useEffect(() => {
    if (formData.make && vehicleData?.models && vehicleData.models[formData.make]) {
      setAvailableOptions(prev => ({
        ...prev,
        models: vehicleData.models[formData.make] || []
      }));
      // Reset all dependent fields
      resetDependentFields(['model', 'variant', 'year', 'transmission_type', 'assembly', 'engine_capacity', 'body_type']);
    } else {
      setAvailableOptions(prev => ({
        ...prev,
        models: []
      }));
    }
  }, [formData.make]);

  // Level 2: Model → Variants
  useEffect(() => {
    if (
      formData.make &&
      formData.model &&
      vehicleData.variants &&
      vehicleData.variants[formData.make] &&
      vehicleData.variants[formData.make][formData.model]
    ) {
      setAvailableOptions(prev => ({
        ...prev,
        variants: vehicleData.variants[formData.make][formData.model] || []
      }));
      // Reset dependent fields
      resetDependentFields(['variant', 'model_year', 'transmission_type', 'assembly', 'engine_capacity', 'body_type']);
    } else {
      setAvailableOptions(prev => ({
        ...prev,
        variants: []
      }));
    }
  }, [formData.make, formData.model]);

  // Level 3: Variant → Years
  useEffect(() => {
    if (
      formData.make &&
      formData.model &&
      formData.variant &&
      vehicleData.model_years &&
      vehicleData.model_years[formData.make] &&
      vehicleData.model_years[formData.make][formData.model] &&
      vehicleData.model_years[formData.make][formData.model][formData.variant]
    ) {
      const years = vehicleData.model_years[formData.make][formData.model][formData.variant] || [];
      // Sort years in ascending order
      const sortedYears = [...years].sort((a, b) => parseInt(a) - parseInt(b));
      setAvailableOptions(prev => ({
        ...prev,
        years: sortedYears
      }));
      // Reset dependent fields
      resetDependentFields(['model_year', 'transmission_type', 'assembly', 'engine_capacity', 'body_type']);
    } else {
      setAvailableOptions(prev => ({
        ...prev,
        years: []
      }));
    }
  }, [formData.make, formData.model, formData.variant]);

  // Level 4: Year → Transmissions
  useEffect(() => {
    if (
      formData.make &&
      formData.model &&
      formData.variant &&
      formData.model_year &&
      vehicleData.transmissions &&
      vehicleData.transmissions[formData.make] &&
      vehicleData.transmissions[formData.make][formData.model] &&
      vehicleData.transmissions[formData.make][formData.model][formData.variant] &&
      vehicleData.transmissions[formData.make][formData.model][formData.variant][formData.model_year]
    ) {
      const transmissions = vehicleData.transmissions[formData.make][formData.model][formData.variant][formData.model_year] || [];
      setAvailableOptions(prev => ({
        ...prev,
        transmissions: transmissions
      }));
      // Reset dependent fields
      resetDependentFields(['transmission_type', 'assembly', 'engine_capacity', 'body_type']);
    } else {
      setAvailableOptions(prev => ({
        ...prev,
        transmissions: []
      }));
    }
  }, [formData.make, formData.model, formData.variant, formData.model_year]);

  // Level 5: Transmission → Assemblies
  useEffect(() => {
    const transmissionKey = getTransmissionKeyForJSON(formData.transmission_type);
    if (
      formData.make &&
      formData.model &&
      formData.variant &&
      formData.model_year &&
      formData.transmission_type &&
      transmissionKey &&
      vehicleData.assemblies &&
      vehicleData.assemblies[formData.make] &&
      vehicleData.assemblies[formData.make][formData.model] &&
      vehicleData.assemblies[formData.make][formData.model][formData.variant] &&
      vehicleData.assemblies[formData.make][formData.model][formData.variant][formData.model_year] &&
      vehicleData.assemblies[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey]
    ) {
      setAvailableOptions(prev => ({
        ...prev,
        assemblies: vehicleData.assemblies[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey] || []
      }));
      // Reset dependent fields
      resetDependentFields(['assembly', 'engine_capacity', 'body_type']);
    } else {
      setAvailableOptions(prev => ({
        ...prev,
        assemblies: []
      }));
    }
  }, [formData.make, formData.model, formData.variant, formData.model_year, formData.transmission_type]);

  // Level 6: Assembly → Engine Capacities
  useEffect(() => {
    const transmissionKey = getTransmissionKeyForJSON(formData.transmission_type);
    if (
      formData.make &&
      formData.model &&
      formData.variant &&
      formData.model_year &&
      formData.transmission_type &&
      transmissionKey &&
      formData.assembly &&
      vehicleData.engine_capacities &&
      vehicleData.engine_capacities[formData.make] &&
      vehicleData.engine_capacities[formData.make][formData.model] &&
      vehicleData.engine_capacities[formData.make][formData.model][formData.variant] &&
      vehicleData.engine_capacities[formData.make][formData.model][formData.variant][formData.model_year] &&
      vehicleData.engine_capacities[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey] &&
      vehicleData.engine_capacities[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey][formData.assembly]
    ) {
      setAvailableOptions(prev => ({
        ...prev,
        engine_capacities: vehicleData.engine_capacities[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey][formData.assembly] || []
      }));
      // Reset dependent fields
      resetDependentFields(['engine_capacity', 'body_type']);
    } else {
      setAvailableOptions(prev => ({
        ...prev,
        engine_capacities: []
      }));
    }
  }, [formData.make, formData.model, formData.variant, formData.model_year, formData.transmission_type, formData.assembly]);

  // Level 7: Engine Capacity → Body Types
  useEffect(() => {
    const transmissionKey = getTransmissionKeyForJSON(formData.transmission_type);
    if (
      formData.make &&
      formData.model &&
      formData.variant &&
      formData.model_year &&
      formData.transmission_type &&
      transmissionKey &&
      formData.assembly &&
      formData.engine_capacity &&
      vehicleData.body_types &&
      vehicleData.body_types[formData.make] &&
      vehicleData.body_types[formData.make][formData.model] &&
      vehicleData.body_types[formData.make][formData.model][formData.variant] &&
      vehicleData.body_types[formData.make][formData.model][formData.variant][formData.model_year] &&
      vehicleData.body_types[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey] &&
      vehicleData.body_types[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey][formData.assembly] &&
      vehicleData.body_types[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey][formData.assembly][formData.engine_capacity]
    ) {
      setAvailableOptions(prev => ({
        ...prev,
        body_types: vehicleData.body_types[formData.make][formData.model][formData.variant][formData.model_year][transmissionKey][formData.assembly][formData.engine_capacity] || []
      }));
      // Reset dependent fields
      resetDependentFields(['body_type']);
    } else {
      setAvailableOptions(prev => ({
        ...prev,
        body_types: []
      }));
    }
  }, [formData.make, formData.model, formData.variant, formData.model_year, formData.transmission_type, formData.assembly, formData.engine_capacity]);

  return {
    availableOptions,
    flatOptions
  };
};

export default useVehicleCascading;

