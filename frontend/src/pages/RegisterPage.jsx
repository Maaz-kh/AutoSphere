import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthLayout from '../components/AuthLayout';
import { apiClient } from '../services/api';
import logoImage from '../assets/autosphere_logo_main.png';
import '../styles/AuthForms.css';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const PAKISTAN_CENTER = { lat: 24.8607, lng: 67.0011 };

const RegisterPage = () => {
  const [step, setStep] = useState(1); // 1 = role selection, 2 = registration form
  const [workshopStep, setWorkshopStep] = useState(1); // 1 owner, 2 workshop details, 3 services
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [cnicImage, setCnicImage] = useState(null);
  
  // Workshop specific fields
  const [businessName, setBusinessName] = useState('');
  const [workshopNTN, setWorkshopNTN] = useState('');
  const [workshopCity, setWorkshopCity] = useState('');
  const [workshopCountry, setWorkshopCountry] = useState('');
  const [workshopAddress, setWorkshopAddress] = useState('');
  const [workshopLat, setWorkshopLat] = useState(null);
  const [workshopLng, setWorkshopLng] = useState(null);
  const [ntnError, setNtnError] = useState('');
  const [mapsReady, setMapsReady] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerInstanceRef = useRef(null);
  const autocompleteInputRef = useRef(null);
  const autocompleteInstanceRef = useRef(null);

  // Workshop services selection
  const [servicesCatalog, setServicesCatalog] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedServices, setSelectedServices] = useState({}); // serviceId -> { price_min, price_max }

  const [loading, setLoading] = useState(false);

  // Load Google Maps script when workshop registration form is shown
  useEffect(() => {
    if (role !== 'workshop' || step !== 2 || !GOOGLE_MAPS_KEY) return;
    if (window.google?.maps) {
      setMapsReady(true);
      return;
    }
    const callbackName = 'initWorkshopMapCallback';
    window[callbackName] = () => setMapsReady(true);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    return () => {
      delete window[callbackName];
    };
  }, [role, step]);

  useEffect(() => {
    if (role !== 'workshop' || step !== 2 || workshopStep !== 3) return;
    let mounted = true;
    setServicesLoading(true);
    apiClient.get('/public/workshops/services/catalog')
      .then((res) => {
        if (!mounted) return;
        setServicesCatalog(res.data?.data || []);
      })
      .catch(() => {
        toast.error('Failed to load services catalog.');
        setServicesCatalog([]);
      })
      .finally(() => {
        if (mounted) setServicesLoading(false);
      });
    return () => { mounted = false; };
  }, [role, step, workshopStep]);

  // Init map and click listener when script loaded and container mounted
  useEffect(() => {
    if (role !== 'workshop' || step !== 2 || workshopStep !== 2) return;
    if (!mapsReady || !window.google?.maps || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapContainerRef.current, {
      center: PAKISTAN_CENTER,
      zoom: 10,
      mapTypeControl: true,
      streetViewControl: false
    });
    mapInstanceRef.current = map;

    const marker = new window.google.maps.Marker({
      map,
      position: null,
      draggable: true
    });
    markerInstanceRef.current = marker;

    const fillFromGeocode = (lat, lng) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status !== 'OK' || !results?.[0]) return;
        const r = results[0];
        if (r.formatted_address) setWorkshopAddress(r.formatted_address);
        const addr = r.address_components || [];
        for (const c of addr) {
          if (c.types.includes('locality')) setWorkshopCity(c.long_name);
          if (c.types.includes('country')) setWorkshopCountry(c.long_name);
        }
      });
    };

    map.addListener('click', (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      marker.setPosition(e.latLng);
      marker.setVisible(true);
      setWorkshopLat(lat);
      setWorkshopLng(lng);
      fillFromGeocode(lat, lng);
    });
    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      if (pos) {
        const lat = pos.lat();
        const lng = pos.lng();
        setWorkshopLat(lat);
        setWorkshopLng(lng);
        fillFromGeocode(lat, lng);
      }
    });

    if (autocompleteInputRef.current && !autocompleteInstanceRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(
        autocompleteInputRef.current,
        { types: ['address'], componentRestrictions: { country: 'pk' } }
      );
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        map.panTo({ lat, lng });
        marker.setPosition(place.geometry.location);
        marker.setVisible(true);
        setWorkshopLat(lat);
        setWorkshopLng(lng);
        if (place.formatted_address) setWorkshopAddress(place.formatted_address);
        const addr = place.address_components || [];
        for (const c of addr) {
          if (c.types.includes('locality')) setWorkshopCity(c.long_name);
          if (c.types.includes('country')) setWorkshopCountry(c.long_name);
        }
      });
      autocompleteInstanceRef.current = autocomplete;
    }

    return () => {
      markerInstanceRef.current = null;
      mapInstanceRef.current = null;
      autocompleteInstanceRef.current = null;
    };
  }, [mapsReady, role, step, workshopStep]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    if (!cnicImage) {
      toast.error('CNIC image is required.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('full_name', fullName.trim());
      formData.append('email', email.trim().toLowerCase());
      formData.append('phone_number', phone.trim());
      formData.append('password', password);
      formData.append('confirmPassword', confirmPassword);
      formData.append('role', role);
      formData.append('termsAccepted', acceptTerms);
      formData.append('cnic_image', cnicImage);

      if (role === 'workshop') {
        // Validate NTN format
        const ntnRegex = /^\d{7}-\d{1}$/;
        if (!ntnRegex.test(workshopNTN.trim())) {
          setNtnError('NTN must be in format: 1234567-8 (7 digits, hyphen, 1 digit)');
          setLoading(false);
          return;
        }
        setNtnError('');
        if (workshopLat == null || workshopLng == null) {
          toast.error('Please select your workshop location on the map (click or search address).');
          setLoading(false);
          return;
        }

        formData.append('business_name', businessName.trim());
        formData.append('workshop_ntn', workshopNTN.trim());
        formData.append('workshop_city', workshopCity.trim());
        formData.append('workshop_country', workshopCountry.trim());
        formData.append('workshop_address', workshopAddress.trim());
        formData.append('workshop_latitude', String(workshopLat));
        formData.append('workshop_longitude', String(workshopLng));

        const services = Object.entries(selectedServices).map(([service_id, v]) => ({
          service_id: parseInt(service_id, 10),
          price_min: v.price_min === '' ? null : v.price_min,
          price_max: v.price_max === '' ? null : v.price_max
        }));
        if (services.length > 0) {
          formData.append('services', JSON.stringify(services));
        }
      }

      await apiClient.post('/auth/register', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success('Registration successful. Please check your email inbox and verify your account before logging in.');
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setConfirmPassword('');
      setAcceptTerms(false);
      setCnicImage(null);
      setBusinessName('');
      setWorkshopNTN('');
      setWorkshopCity('');
      setWorkshopCountry('');
      setWorkshopAddress('');
      setWorkshopLat(null);
      setWorkshopLng(null);
      setWorkshopStep(1);
      setServicesCatalog([]);
      setSelectedServices({});
      setNtnError('');
    } catch (err) {
      // Handle validation errors from express-validator
      if (err?.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const validationErrors = err.response.data.errors
          .map((error) => error.msg)
          .join('. ');
        toast.error(validationErrors || 'Please check your input and try again.');
      } else {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Unable to complete registration at the moment.';
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
  };

  const handleNext = () => {
    if (!role) {
      toast.error('Please select an account type to continue.');
      return;
    }
    setWorkshopStep(1);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const validateWorkshopStep1 = () => {
    if (!fullName.trim()) return 'Owner name is required.';
    if (!email.trim()) return 'Email is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (!cnicImage) return 'CNIC image is required.';
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (!acceptTerms) return 'You must accept the terms and conditions.';
    return null;
  };

  const validateWorkshopStep2 = () => {
    if (!businessName.trim()) return 'Workshop name is required.';
    const ntnRegex = /^\d{7}-\d{1}$/;
    if (!ntnRegex.test(workshopNTN.trim())) return 'NTN must be in format: 1234567-8 (7 digits, hyphen, 1 digit).';
    if (workshopLat == null || workshopLng == null) return 'Please select your workshop location on the map.';
    if (!workshopAddress.trim()) return 'Workshop address is required.';
    if (!workshopCity.trim()) return 'Workshop city is required.';
    if (!workshopCountry.trim()) return 'Workshop country is required.';
    return null;
  };

  const validateWorkshopStep3 = () => {
    const count = Object.keys(selectedServices).length;
    if (count === 0) return 'Please select at least one service you offer.';
    for (const [sid, v] of Object.entries(selectedServices)) {
      const min = v.price_min === '' || v.price_min == null ? null : parseFloat(v.price_min);
      const max = v.price_max === '' || v.price_max == null ? null : parseFloat(v.price_max);
      if (min != null && (!Number.isFinite(min) || min < 0)) return `Invalid min price for service #${sid}.`;
      if (max != null && (!Number.isFinite(max) || max < 0)) return `Invalid max price for service #${sid}.`;
      if (min != null && max != null && max < min) return `Max price cannot be less than min price for service #${sid}.`;
    }
    return null;
  };

  const handleWorkshopNext = () => {
    if (workshopStep === 1) {
      const err = validateWorkshopStep1();
      if (err) return toast.error(err);
      setWorkshopStep(2);
      return;
    }
    if (workshopStep === 2) {
      const err = validateWorkshopStep2();
      if (err) return toast.error(err);
      setWorkshopStep(3);
      return;
    }
  };

  const handleWorkshopBack = () => {
    if (workshopStep === 1) return;
    setWorkshopStep((s) => Math.max(1, s - 1));
  };

  const toggleService = (serviceId) => {
    setSelectedServices((prev) => {
      const next = { ...prev };
      if (next[serviceId]) {
        delete next[serviceId];
      } else {
        next[serviceId] = { price_min: '', price_max: '' };
      }
      return next;
    });
  };

  // Step 1: Role Selection
  if (step === 1) {
    return (
      <AuthLayout>
        <div className="auth-form">
          <div className="auth-logo-container">
            <img src={logoImage} alt="AutoSphere Logo" className="auth-logo" />
          </div>
          <div className="auth-form-header">
            <h2 className="auth-form-title">Choose your account type</h2>
            <p className="auth-form-subtitle">Select the option that best describes you to get started.</p>
          </div>

          <div className="auth-role-selection">
            <div
              className={`auth-role-card ${role === 'vehicle_owner' ? 'selected' : ''}`}
              onClick={() => handleRoleSelect('vehicle_owner')}
            >
              <h3 className="auth-role-card-title">Vehicle Owner</h3>
            </div>

            <div
              className={`auth-role-card ${role === 'buyer' ? 'selected' : ''}`}
              onClick={() => handleRoleSelect('buyer')}
            >
              <h3 className="auth-role-card-title">Buyer</h3>
            </div>

            <div
              className={`auth-role-card ${role === 'workshop' ? 'selected' : ''}`}
              onClick={() => handleRoleSelect('workshop')}
            >
              <h3 className="auth-role-card-title">Workshop</h3>
            </div>
          </div>

          <button
            type="button"
            className="auth-button-primary"
            onClick={handleNext}
            disabled={!role}
          >
            Next
          </button>

          <p className="auth-form-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  // Step 2: Registration Form
  return (
    <AuthLayout>
      <form
        className="auth-form"
        onSubmit={(e) => {
          if (role === 'workshop' && workshopStep !== 3) {
            e.preventDefault();
            handleWorkshopNext();
            return;
          }
          if (role === 'workshop') {
            const err = validateWorkshopStep3();
            if (err) {
              e.preventDefault();
              toast.error(err);
              return;
            }
          }
          handleSubmit(e);
        }}
      >
        <div className="auth-logo-container">
          <img src={logoImage} alt="AutoSphere Logo" className="auth-logo" />
        </div>
        <div className="auth-form-header">
          <h2 className="auth-form-title">Create your account</h2>
          <p className="auth-form-subtitle">Complete your registration and verify your email.</p>
        </div>

        <div className="auth-form-body">
          <button
            type="button"
            className="auth-button-back"
            onClick={handleBack}
          >
            ← Back
          </button>

          {role === 'workshop' && (
            <div className="auth-stepper">
              <div className={`auth-step ${workshopStep === 1 ? 'active' : workshopStep > 1 ? 'done' : ''}`}>1. Owner</div>
              <div className={`auth-step ${workshopStep === 2 ? 'active' : workshopStep > 2 ? 'done' : ''}`}>2. Workshop</div>
              <div className={`auth-step ${workshopStep === 3 ? 'active' : ''}`}>3. Services</div>
            </div>
          )}

          {role !== 'workshop' && (
            <>
              <div className="auth-form-field">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Muhammad Ali" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="email">Email *</label>
                <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="phone">Phone (Pakistan)</label>
                <input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XXXXXXXXX or +92XXXXXXXXXX" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="cnicImage">CNIC Image *</label>
                <input id="cnicImage" type="file" accept="image/*" required onChange={(e) => setCnicImage(e.target.files[0])} />
                {cnicImage && <span className="auth-file-selected">{cnicImage.name}</span>}
              </div>
              <div className="auth-form-field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input id="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" />
              </div>
              <div className="auth-form-field auth-form-checkbox">
                <label>
                  <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />{' '}
                  I agree to the AutoSphere terms and conditions.
                </label>
              </div>
              <button type="submit" className="auth-button-primary" disabled={loading}>
                {loading ? 'Creating your account…' : 'Create account'}
              </button>
            </>
          )}

          {role === 'workshop' && workshopStep === 1 && (
            <>
              <div className="auth-form-field">
                <label htmlFor="fullName">Owner Name</label>
                <input id="fullName" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Owner full name" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="email">Owner Email *</label>
                <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="phone">Owner Phone Number</label>
                <input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XXXXXXXXX or +92XXXXXXXXXX" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="cnicImage">Owner CNIC Image *</label>
                <input id="cnicImage" type="file" accept="image/*" required onChange={(e) => setCnicImage(e.target.files[0])} />
                {cnicImage && <span className="auth-file-selected">{cnicImage.name}</span>}
              </div>
              <div className="auth-form-field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input id="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" />
              </div>
              <div className="auth-form-field auth-form-checkbox">
                <label>
                  <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />{' '}
                  I agree to the AutoSphere terms and conditions.
                </label>
              </div>
              <button type="button" className="auth-button-primary" onClick={handleWorkshopNext} disabled={loading}>
                Next
              </button>
            </>
          )}

          {role === 'workshop' && workshopStep === 2 && (
            <>
              <div className="auth-form-field">
                <label htmlFor="businessName">Workshop Name *</label>
                <input id="businessName" type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="ABC Auto Workshop" />
              </div>
              <div className="auth-form-field">
                <label htmlFor="workshopNTN">Workshop National Tax Number (NTN) *</label>
                <input
                  id="workshopNTN"
                  type="text"
                  required
                  value={workshopNTN}
                  onChange={(e) => {
                    setWorkshopNTN(e.target.value);
                    if (ntnError) setNtnError('');
                  }}
                  placeholder="1234567-8"
                  pattern="\\d{7}-\\d{1}"
                />
                {ntnError && <span className="auth-field-error">{ntnError}</span>}
              </div>

              <div className="auth-form-section">
                <h3 className="auth-form-section-title">Workshop Location</h3>
                <div className="auth-form-field auth-workshop-map-section">
                  <label>Select location on map *</label>
                  {GOOGLE_MAPS_KEY ? (
                    <>
                      <input ref={autocompleteInputRef} type="text" className="auth-map-search" placeholder="Search address (e.g. Karachi, Lahore)" autoComplete="off" />
                      <div ref={mapContainerRef} className="auth-map-container" style={{ display: mapsReady ? 'block' : 'none' }} />
                      {!mapsReady && <div className="auth-map-loading">Loading map…</div>}
                      {(workshopLat != null && workshopLng != null) && <p className="auth-map-selected">Location set. You can edit the fields below if needed.</p>}
                    </>
                  ) : (
                    <p className="auth-map-no-key">Google Maps API key not configured. Set VITE_GOOGLE_MAPS_API_KEY in .env</p>
                  )}
                </div>

                <div className="auth-form-field">
                  <label htmlFor="workshopAddress">Address *</label>
                  <input id="workshopAddress" type="text" required value={workshopAddress} onChange={(e) => setWorkshopAddress(e.target.value)} placeholder="Street address (search or click on map first)" />
                </div>
                <div className="auth-form-field">
                  <label htmlFor="workshopCity">City *</label>
                  <input id="workshopCity" type="text" required value={workshopCity} onChange={(e) => setWorkshopCity(e.target.value)} placeholder="City" />
                </div>
                <div className="auth-form-field">
                  <label htmlFor="workshopCountry">Country *</label>
                  <input id="workshopCountry" type="text" required value={workshopCountry} onChange={(e) => setWorkshopCountry(e.target.value)} placeholder="Country" />
                </div>
              </div>

              <div className="auth-actions-row">
                <button type="button" className="auth-button-secondary" onClick={handleWorkshopBack} disabled={loading}>Back</button>
                <button type="button" className="auth-button-primary" onClick={handleWorkshopNext} disabled={loading}>Next</button>
              </div>
            </>
          )}

          {role === 'workshop' && workshopStep === 3 && (
            <>
              <div className="auth-form-section">
                <h3 className="auth-form-section-title">Services Offered</h3>
                <p className="auth-map-hint">Select the services you offer. Optionally set a price range (PKR).</p>
                {servicesLoading ? (
                  <div className="auth-map-loading">Loading services…</div>
                ) : servicesCatalog.length === 0 ? (
                  <div className="auth-alert auth-alert-error">No services available right now.</div>
                ) : (
                  <div className="auth-services-list">
                    {servicesCatalog.map((s) => {
                      const checked = !!selectedServices[String(s.id)];
                      const prices = selectedServices[String(s.id)] || { price_min: '', price_max: '' };
                      return (
                        <div key={s.id} className={`auth-service-row ${checked ? 'selected' : ''}`}>
                          <label className="auth-service-check">
                            <input type="checkbox" checked={checked} onChange={() => toggleService(String(s.id))} />
                            <span className="auth-service-name">{s.name}</span>
                            <span className="auth-service-cat">{s.category}</span>
                          </label>
                          {checked && (
                            <div className="auth-service-prices">
                              <input
                                type="number"
                                min="0"
                                placeholder="Min Price"
                                value={prices.price_min}
                                onChange={(e) => setSelectedServices((prev) => ({ ...prev, [String(s.id)]: { ...prev[String(s.id)], price_min: e.target.value } }))}
                              />
                              <input
                                type="number"
                                min="0"
                                placeholder="Max Price"
                                value={prices.price_max}
                                onChange={(e) => setSelectedServices((prev) => ({ ...prev, [String(s.id)]: { ...prev[String(s.id)], price_max: e.target.value } }))}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="auth-actions-row">
                <button type="button" className="auth-button-secondary" onClick={handleWorkshopBack} disabled={loading}>Back</button>
                <button type="submit" className="auth-button-primary" disabled={loading}>
                  {loading ? 'Creating your account…' : 'Create account'}
                </button>
              </div>
            </>
          )}

          <p className="auth-form-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};

export default RegisterPage;

