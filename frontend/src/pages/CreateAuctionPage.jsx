import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { X, Upload } from "lucide-react";
import DashboardNavbar from "../components/DashboardNavbar";
import { apiClient } from "../services/api";
import { uploadFilesInBatches } from "../services/cloudinary-upload";
import PageHeroWithFilters from "../components/PageHeroWithFilters";
import "../styles/RegisterVehicle.css";
import "../styles/CreateAuctionPage.css";

const DURATION_OPTIONS = [3, 5, 7, 10];
const MAX_PHOTO_SIZE_MB = 5; // 5MB per photo
/** Must match backend auction-service AUCTION_PHOTOS_MIN / MAX */
const AUCTION_PHOTOS_MIN = 5;
const AUCTION_PHOTOS_MAX = 10;

const CreateAuctionPage = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    vehicle_id: "",
    description: "",
    reserve_price: "",
    starting_bid: "",
    duration_days: "5",
    start_immediate: true,
    start_at: "",
    featured: false,
    terms_accepted: false,
    odometer_km: "",
  });
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photoFiles]);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const res = await apiClient.get("/vehicles");
        setVehicles(res.data?.data || []);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load vehicles");
      }
    };
    fetchVehicles();
  }, []);

  useEffect(() => {
    if (!formData.vehicle_id) {
      setEligibility(null);
      return;
    }
    const check = async () => {
      setLoadingEligibility(true);
      try {
        const res = await apiClient.get(
          `/auctions/eligibility/${formData.vehicle_id}`,
        );
        setEligibility(res.data?.data || null);
      } catch {
        setEligibility({
          eligible: false,
          message: "Could not check eligibility.",
        });
      } finally {
        setLoadingEligibility(false);
      }
    };
    check();
  }, [formData.vehicle_id]);

  const selectedVehicle = vehicles.find(
    (v) => String(v.id) === String(formData.vehicle_id),
  );
  const isEligible = eligibility && eligibility.eligible;

  useEffect(() => {
    if (!formData.vehicle_id || !selectedVehicle) {
      if (!formData.vehicle_id)
        setFormData((prev) => ({ ...prev, odometer_km: "" }));
      return;
    }
    const mileage =
      selectedVehicle.mileage_km != null && selectedVehicle.mileage_km !== ""
        ? String(selectedVehicle.mileage_km)
        : "";
    setFormData((prev) => ({ ...prev, odometer_km: mileage }));
  }, [formData.vehicle_id]);

  const vehicleMileage =
    selectedVehicle?.mileage_km != null
      ? Number(selectedVehicle.mileage_km)
      : null;

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const addPhotoFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    const maxBytes = MAX_PHOTO_SIZE_MB * 1024 * 1024;
    const nameOk = (f) =>
      f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name);

    setPhotoFiles((prev) => {
      const out = [...prev];
      for (const file of incoming) {
        if (out.length >= AUCTION_PHOTOS_MAX) {
          toast.error(`Maximum ${AUCTION_PHOTOS_MAX} photos allowed.`);
          break;
        }
        if (!nameOk(file)) {
          toast.error(`${file.name} is not a supported image type.`);
          continue;
        }
        if (file.size > maxBytes) {
          toast.error(
            `${file.name} exceeds ${MAX_PHOTO_SIZE_MB}MB. Max ${MAX_PHOTO_SIZE_MB}MB per image.`,
          );
          continue;
        }
        out.push(file);
      }
      return out;
    });
  };

  const handlePhotoInput = (e) => {
    addPhotoFiles(e.target.files);
    e.target.value = "";
  };

  const removePhotoFile = (index) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalPhotoCount = photoFiles.length;

  const handleSubmit = (publish) => {
    setErrors({});
    const status = publish ? "active" : "draft";

    if (!formData.vehicle_id) {
      setErrors({ vehicle_id: "Please select a vehicle" });
      toast.error("Please select a vehicle");
      return;
    }

    if (publish) {
      if (!formData.description.trim()) {
        setErrors({ description: "Description is required" });
        toast.error("Description is required");
        return;
      }
      const reserve = parseFloat(formData.reserve_price);
      const startBid = parseFloat(formData.starting_bid);
      if (isNaN(reserve) || reserve <= 0) {
        setErrors({ reserve_price: "Enter a valid reserve price" });
        toast.error("Enter a valid reserve price");
        return;
      }
      if (isNaN(startBid) || startBid <= 0) {
        setErrors({ starting_bid: "Enter a valid starting bid" });
        toast.error("Enter a valid starting bid");
        return;
      }
      if (startBid > reserve) {
        setErrors({ starting_bid: "Starting bid cannot exceed reserve price" });
        toast.error("Starting bid cannot exceed reserve price");
        return;
      }
      if (!formData.terms_accepted) {
        setErrors({ terms_accepted: "You must accept the terms to publish" });
        toast.error("You must accept the auction terms and conditions to publish");
        return;
      }
      if (totalPhotoCount < AUCTION_PHOTOS_MIN || totalPhotoCount > AUCTION_PHOTOS_MAX) {
        setErrors({ photos: `Publishing requires between ${AUCTION_PHOTOS_MIN} and ${AUCTION_PHOTOS_MAX} photos` });
        toast.error(`Publishing requires between ${AUCTION_PHOTOS_MIN} and ${AUCTION_PHOTOS_MAX} photos`);
        return;
      }
    } else {
      if (totalPhotoCount > AUCTION_PHOTOS_MAX) {
        setErrors({ photos: `Maximum ${AUCTION_PHOTOS_MAX} photos allowed` });
        toast.error(`Maximum ${AUCTION_PHOTOS_MAX} photos allowed`);
        return;
      }
    }

    if (formData.odometer_km !== "" && vehicleMileage != null) {
      const odometerVal = parseInt(formData.odometer_km, 10);
      if (isNaN(odometerVal) || odometerVal < 0) {
        setErrors({ odometer_km: "Enter a valid odometer reading" });
        toast.error("Enter a valid odometer reading");
        return;
      }
      if (odometerVal < vehicleMileage) {
        setErrors({
          odometer_km: `Cannot be less than vehicle registration reading (${vehicleMileage.toLocaleString()} km)`,
        });
        toast.error(`Odometer cannot be less than ${vehicleMileage.toLocaleString()} km`);
        return;
      }
    }

    submitAuction(status);
  };

  const submitAuction = async (status) => {
    setLoadingSubmit(true);
    try {
      let photoUrls = [];
      if (photoFiles.length > 0) {
        const configRes = await apiClient.get("/auctions/upload-config");
        const { cloudName, uploadPreset } = configRes.data?.data || {};
        if (!cloudName || !uploadPreset) {
          toast.error("Upload is not configured. Please try again later.");
          setLoadingSubmit(false);
          return;
        }
        toast.info(`Uploading ${photoFiles.length} photo(s)…`);
        photoUrls = await uploadFilesInBatches(
          photoFiles,
          cloudName,
          uploadPreset,
        );
      }

      const body = {
        vehicle_id: formData.vehicle_id,
        description: formData.description.trim(),
        reserve_price: formData.reserve_price,
        starting_bid: formData.starting_bid,
        duration_days: formData.duration_days,
        start_immediate: formData.start_immediate,
        start_at:
          !formData.start_immediate && formData.start_at
            ? new Date(formData.start_at).toISOString()
            : undefined,
        featured: formData.featured,
        terms_accepted: formData.terms_accepted,
        status,
        odometer_km:
          formData.odometer_km !== "" ? formData.odometer_km : undefined,
        photo_urls: photoUrls,
      };

      await apiClient.post("/auctions", body);
      toast.success(
        status === "draft"
          ? "Auction draft saved."
          : "Auction created successfully.",
      );
      navigate("/dashboard/owner/auctions");
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to create auction";
      toast.error(msg);
      setErrors({ submit: msg });
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="dash-shell create-auction-page">
      <DashboardNavbar />
      <main className="create-auction-main">
        <div className="layout-page-inner">
          <div className="create-auction-hero-container">
            <PageHeroWithFilters
              title="Create Auction"
              subtitle="List your vehicle for auction. Select a vehicle, set your price, and add photos."
              button={{
                text: "Back to My Vehicles",
                onClick: () => navigate("/dashboard/owner"),
              }}
              filters={[]}
            />
          </div>

        <div className="create-auction-form-container">
          <form
            className="create-auction-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(true);
            }}
          >
            {/* Vehicle selection and odometer reading*/}
            <section className="form-section">
              <h2 className="section-title">
                Select Vehicle & Odometer reading
              </h2>
              <div className="form-grid two-col-grid">
                {/* Vehicle selection */}
                <div className="form-group">
                  <label htmlFor="vehicle_id">
                    Your vehicle <span className="required">*</span>
                  </label>
                  <select
                    id="vehicle_id"
                    name="vehicle_id"
                    value={formData.vehicle_id}
                    onChange={handleInputChange}
                    className={errors.vehicle_id ? "error" : ""}
                  >
                    <option value="">Select a vehicle</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.make} {v.model} {v.variant ? v.variant : ""}{" "}
                        {v.model_year} — {v.registration_number}
                      </option>
                    ))}
                  </select>
                  {errors.vehicle_id && (
                    <span className="field-error">{errors.vehicle_id}</span>
                  )}
                  {loadingEligibility && (
                    <p className="field-hint">Checking eligibility…</p>
                  )}
                  {eligibility && !loadingEligibility && (
                    <p
                      className={
                        eligibility.eligible
                          ? "eligibility-ok"
                          : "eligibility-warn"
                      }
                    >
                      {eligibility.message}
                      {!eligibility.eligible &&
                        eligibility.missingItems?.length > 0 && (
                          <span>
                            {" "}
                            Missing: {eligibility.missingItems.join(", ")}
                          </span>
                        )}
                    </p>
                  )}
                </div>
                {/* Odometer reading (auction-level, when vehicle selected and eligible) */}
                <div className="form-group">
                  <label htmlFor="odometer_km">Current odometer (km)</label>
                  <input
                    type="number"
                    id="odometer_km"
                    name="odometer_km"
                    value={formData.odometer_km}
                    onChange={handleInputChange}
                    disabled={!isEligible || !selectedVehicle}
                    min={vehicleMileage != null ? vehicleMileage : 0}
                    step="1"
                    placeholder={
                      vehicleMileage != null
                        ? `Min ${vehicleMileage.toLocaleString()} km`
                        : "Select vehicle first"
                    }
                    className={errors.odometer_km ? "error" : ""}
                  />
                  {errors.odometer_km && (
                    <span className="field-error">{errors.odometer_km}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Vehicle specifications (buyer-facing, from registration) */}
            {selectedVehicle && (
              <section className="form-section vehicle-specs-section">
                <h2 className="section-title">Vehicle specifications</h2>
                <p className="section-hint">
                  These details will be shown to buyers on the auction listing.
                </p>
                <div className="vehicle-specs-grid">
                  {selectedVehicle.make && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Make</span>
                      <span className="spec-value">{selectedVehicle.make}</span>
                    </div>
                  )}
                  {selectedVehicle.model && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Model</span>
                      <span className="spec-value">
                        {selectedVehicle.model}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.variant && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Variant</span>
                      <span className="spec-value">
                        {selectedVehicle.variant}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.model_year && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Year</span>
                      <span className="spec-value">
                        {selectedVehicle.model_year}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.body_type && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Body type</span>
                      <span className="spec-value">
                        {selectedVehicle.body_type}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.fuel_type && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Fuel type</span>
                      <span className="spec-value">
                        {selectedVehicle.fuel_type}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.transmission_type && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Transmission</span>
                      <span className="spec-value">
                        {selectedVehicle.transmission_type}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.engine_capacity && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Engine</span>
                      <span className="spec-value">
                        {selectedVehicle.engine_capacity}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.mileage_km != null &&
                    selectedVehicle.mileage_km !== "" && (
                      <div className="vehicle-spec-item">
                        <span className="spec-label">Mileage</span>
                        <span className="spec-value">
                          {Number(selectedVehicle.mileage_km).toLocaleString()}{" "}
                          km
                        </span>
                      </div>
                    )}
                  {selectedVehicle.color && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Color</span>
                      <span className="spec-value">
                        {selectedVehicle.color}
                      </span>
                    </div>
                  )}
                  {selectedVehicle.registered_city && (
                    <div className="vehicle-spec-item">
                      <span className="spec-label">Registered city</span>
                      <span className="spec-value">
                        {selectedVehicle.registered_city}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Description */}
            <section className="form-section">
              <h2 className="section-title">Description</h2>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label htmlFor="description">
                    Vehicle description <span className="required">*</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={5}
                    placeholder="Key features, condition, modifications, known issues, reason for selling..."
                    className={errors.description ? "error" : ""}
                  />
                  {errors.description && (
                    <span className="field-error">{errors.description}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Pricing */}
            <section className="form-section">
              <h2 className="section-title">Pricing</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="reserve_price">
                    Reserve price (PKR) <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    id="reserve_price"
                    name="reserve_price"
                    value={formData.reserve_price}
                    onChange={handleInputChange}
                    min="1"
                    max="9999999999"
                    step="1"
                    placeholder="e.g. 2500000"
                    className={errors.reserve_price ? "error" : ""}
                  />
                  {errors.reserve_price && (
                    <span className="field-error">{errors.reserve_price}</span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="starting_bid">
                    Starting bid (PKR) <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    id="starting_bid"
                    name="starting_bid"
                    value={formData.starting_bid}
                    onChange={handleInputChange}
                    min="1"
                    max="9999999999"
                    step="1"
                    placeholder="e.g. 200000"
                    className={errors.starting_bid ? "error" : ""}
                  />
                  {errors.starting_bid && (
                    <span className="field-error">{errors.starting_bid}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Duration & start */}
            <section className="form-section">
              <h2 className="section-title">Duration & Start</h2>

              <div className="form-grid two-col-grid">
                {/* Duration */}
                <div className="form-group">
                  <label htmlFor="duration_days">Auction duration</label>
                  <select
                    id="duration_days"
                    name="duration_days"
                    value={formData.duration_days}
                    onChange={handleInputChange}
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </div>

                {/* Scheduled start (always visible; disabled when start immediately is enabled) */}
                <div className="form-group">
                  <label htmlFor="start_at">Scheduled start</label>
                  <input
                    type="datetime-local"
                    id="start_at"
                    name="start_at"
                    value={formData.start_at}
                    onChange={handleInputChange}
                    min={new Date().toISOString().slice(0, 16)}
                    disabled={formData.start_immediate}
                  />
                </div>
              </div>

              {/* Checkboxes in same row */}
              <div className="form-grid two-col-grid checkbox-row">
                <div className="form-group form-group-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="featured"
                      checked={formData.featured}
                      onChange={handleInputChange}
                    />
                    Featured listing
                  </label>
                </div>

                <div className="form-group form-group-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="start_immediate"
                      checked={formData.start_immediate}
                      onChange={handleInputChange}
                    />
                    Start auction immediately
                  </label>
                </div>
              </div>
            </section>

            {/* Photos */}
            <section className="form-section">
              <h2 className="section-title">Auction Photos</h2>
              <p className="section-hint">
                High-quality images, max {MAX_PHOTO_SIZE_MB}MB each. Min {AUCTION_PHOTOS_MIN}, max{' '}
                {AUCTION_PHOTOS_MAX} to publish.
              </p>
              <div className="form-grid">
                <div className="form-group full-width">
                  <div className="file-upload-wrapper file-upload-auction">
                    <input
                      ref={fileInputRef}
                      id="auction-photo-input"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      multiple
                      onChange={handlePhotoInput}
                      className="file-input-hidden"
                    />
                    {photoFiles.length === 0 ? (
                      <div
                        className={`auction-photo-dropzone ${photoDragActive ? "drag-active" : ""}`}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setPhotoDragActive(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          if (e.currentTarget === e.target) setPhotoDragActive(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setPhotoDragActive(false);
                          addPhotoFiles(e.dataTransfer.files);
                        }}
                      >
                        <Upload className="auction-dropzone-icon" aria-hidden />
                        <p className="auction-dropzone-text">
                          Drag and drop images here, or
                        </p>
                        <label
                          htmlFor="auction-photo-input"
                          className="ui-btn-primary auction-photo-select-label"
                        >
                          <Upload size={18} aria-hidden />
                          Select images
                        </label>
                        <p className="auction-dropzone-hint">
                          JPG, PNG or WebP · up to {MAX_PHOTO_SIZE_MB}MB each ·
                          {AUCTION_PHOTOS_MIN}–{AUCTION_PHOTOS_MAX} photos required to publish
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="images-preview-section">
                          <div className="images-grid">
                            {photoFiles.map((file, index) => (
                              <div key={`${file.name}-${index}`} className="image-preview-item">
                                <img
                                  src={photoPreviewUrls[index]}
                                  alt={`Photo ${index + 1}`}
                                  className="preview-image"
                                />
                                <span className="image-number">{index + 1}</span>
                                <button
                                  type="button"
                                  className="remove-image-btn"
                                  onClick={() => removePhotoFile(index)}
                                  aria-label="Remove image"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div
                          className={`auction-photo-add-more ${photoDragActive ? "drag-active" : ""}`}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            setPhotoDragActive(true);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            if (e.currentTarget === e.target) setPhotoDragActive(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setPhotoDragActive(false);
                            addPhotoFiles(e.dataTransfer.files);
                          }}
                        >
                          <span>Drop more images here or </span>
                          <label
                            htmlFor="auction-photo-input"
                            className="ui-btn-secondary auction-photo-select-label"
                          >
                            <Upload size={16} aria-hidden />
                            Add images
                          </label>
                          <span className="auction-add-more-count">
                            {" "}
                            ({totalPhotoCount} / {AUCTION_PHOTOS_MAX})
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  {errors.photos && (
                    <span className="field-error">{errors.photos}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Terms */}
            <section className="form-section">
              <h2 className="section-title">Terms</h2>
              <p className="section-hint">
                Required when publishing. You can save as draft without accepting.
              </p>
              <div className="form-grid">
                <div className="form-group full-width form-group-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="terms_accepted"
                      checked={formData.terms_accepted}
                      onChange={handleInputChange}
                    />
                    I accept the auction terms and seller responsibilities{" "}
                    <span className="required">*</span>
                  </label>
                  {errors.terms_accepted && (
                    <span className="field-error">{errors.terms_accepted}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="form-actions">
              <button
                type="button"
                onClick={() => navigate("/dashboard/owner")}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={loadingSubmit}
                className="btn-secondary"
              >
                {loadingSubmit ? "Saving…" : "Save as draft"}
              </button>
              <button
                type="submit"
                disabled={loadingSubmit}
                className="btn-primary"
              >
                {loadingSubmit ? "Publishing…" : "Publish auction"}
              </button>
            </div>
          </form>
        </div>
        </div>
      </main>
    </div>
  );
};

export default CreateAuctionPage;
