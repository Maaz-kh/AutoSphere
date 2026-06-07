import { useState, useEffect, useRef } from "react";
import { X, Upload } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import DashboardNavbar from "../components/DashboardNavbar";
import { apiClient } from "../services/api";
import { uploadFilesInBatches } from "../services/cloudinary-upload";
import PageHeroWithFilters from "../components/PageHeroWithFilters";
import LoadingSpinner from "../components/LoadingSpinner";
import "../styles/RegisterVehicle.css";
import "../styles/CreateAuctionPage.css";

const DURATION_OPTIONS = [3, 5, 7, 10];
const MAX_PHOTO_SIZE_MB = 5;
const AUCTION_PHOTOS_MIN = 5;
const AUCTION_PHOTOS_MAX = 10;

const EditAuctionPage = () => {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
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
  const [existingPhotoUrls, setExistingPhotoUrls] = useState([]);
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
    const fetchDraft = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get(`/auctions/my-auctions/${auctionId}`);
        const data = res.data?.data;
        if (!data) {
          toast.error("Auction not found.");
          navigate("/dashboard/owner/auctions");
          return;
        }
        if (data.status !== "draft") {
          toast.error("Only draft auctions can be edited.");
          navigate("/dashboard/owner/auctions");
          return;
        }
        setAuction(data);
        setFormData({
          description: data.description || "",
          reserve_price: data.reserve_price != null ? String(data.reserve_price) : "",
          starting_bid: data.starting_bid != null ? String(data.starting_bid) : "",
          duration_days: data.duration_days ? String(data.duration_days) : "5",
          start_immediate: !data.start_at,
          start_at: data.start_at ? new Date(data.start_at).toISOString().slice(0, 16) : "",
          featured: Boolean(data.featured),
          terms_accepted: !!data.terms_accepted_at,
          odometer_km: data.odometer_km != null && data.odometer_km !== "" ? String(data.odometer_km) : "",
        });
        setExistingPhotoUrls((data.photos || []).map((p) => p.image_url));
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load draft.");
        navigate("/dashboard/owner/auctions");
      } finally {
        setLoading(false);
      }
    };
    if (auctionId) fetchDraft();
  }, [auctionId, navigate]);

  const vehicle = auction
    ? { make: auction.make, model: auction.model, variant: auction.variant, model_year: auction.model_year, mileage_km: auction.mileage_km }
    : null;
  const vehicleMileage = vehicle?.mileage_km != null ? Number(vehicle.mileage_km) : null;

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
        if (existingPhotoUrls.length + out.length >= AUCTION_PHOTOS_MAX) {
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

  const removeExistingPhoto = (index) => {
    setExistingPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const totalPhotoCount = existingPhotoUrls.length + photoFiles.length;

  const handleSubmit = (publish) => {
    setErrors({});
    const status = publish ? (formData.start_immediate ? "active" : "scheduled") : "draft";

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
    if (formData.odometer_km !== "" && vehicleMileage != null) {
      const odometerVal = parseInt(formData.odometer_km, 10);
      if (isNaN(odometerVal) || odometerVal < 0) {
        setErrors({ odometer_km: "Enter a valid odometer reading" });
        toast.error("Enter a valid odometer reading");
        return;
      }
      if (odometerVal < vehicleMileage) {
        setErrors({ odometer_km: `Cannot be less than vehicle registration (${vehicleMileage.toLocaleString()} km)` });
        toast.error(`Odometer cannot be less than ${vehicleMileage.toLocaleString()} km`);
        return;
      }
    }
    if (publish && !formData.terms_accepted) {
      setErrors({ terms_accepted: "You must accept the terms to publish" });
      toast.error("You must accept the auction terms and conditions to publish");
      return;
    }
    if (publish) {
      if (totalPhotoCount < AUCTION_PHOTOS_MIN || totalPhotoCount > AUCTION_PHOTOS_MAX) {
        setErrors({ photos: `Publishing requires between ${AUCTION_PHOTOS_MIN} and ${AUCTION_PHOTOS_MAX} photos` });
        toast.error(`Publishing requires between ${AUCTION_PHOTOS_MIN} and ${AUCTION_PHOTOS_MAX} photos`);
        return;
      }
      if (!formData.start_immediate && !formData.start_at) {
        setErrors({ start_at: "Choose a start date or start immediately" });
        toast.error("Choose immediate start or a future start date");
        return;
      }
    } else {
      if (totalPhotoCount > AUCTION_PHOTOS_MAX) {
        setErrors({ photos: `Maximum ${AUCTION_PHOTOS_MAX} photos allowed` });
        toast.error(`Maximum ${AUCTION_PHOTOS_MAX} photos allowed`);
        return;
      }
    }

    submitAuction(status);
  };

  const submitAuction = async (status) => {
    setLoadingSubmit(true);
    try {
      let newUrls = [];
      if (photoFiles.length > 0) {
        const configRes = await apiClient.get("/auctions/upload-config");
        const { cloudName, uploadPreset } = configRes.data?.data || {};
        if (!cloudName || !uploadPreset) {
          toast.error("Upload is not configured.");
          setLoadingSubmit(false);
          return;
        }
        toast.info(`Uploading ${photoFiles.length} new photo(s)…`);
        newUrls = await uploadFilesInBatches(photoFiles, cloudName, uploadPreset);
      }
      const photo_urls = [...existingPhotoUrls, ...newUrls];

      const body = {
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
        odometer_km: formData.odometer_km !== "" ? formData.odometer_km : undefined,
        photo_urls,
      };

      const res = await apiClient.patch(`/auctions/my-auctions/${auctionId}`, body);
      toast.success(res.data?.message || (status === "draft" ? "Draft saved." : "Auction published."));
      navigate("/dashboard/owner/auctions");
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to update auction.";
      toast.error(msg);
      setErrors({ submit: msg });
    } finally {
      setLoadingSubmit(false);
    }
  };

  if (loading || !auction) {
    return (
      <div className="dash-shell create-auction-page">
        <DashboardNavbar />
        <main className="create-auction-main">
          <div className="layout-page-inner">
            <LoadingSpinner message="Loading draft…" />
          </div>
        </main>
      </div>
    );
  }

  /** Single-line read-only summary (edit draft only; vehicle cannot be changed). */
  const vehicleDisplayLine = (() => {
    if (!auction) return "—";
    const seg = [auction.make, auction.model, auction.variant].filter(Boolean).join(" ").trim();
    const y =
      auction.model_year != null && auction.model_year !== ""
        ? ` · ${auction.model_year}`
        : "";
    const r = auction.registration_number
      ? ` — ${auction.registration_number}`
      : "";
    const s = `${seg}${y}${r}`.trim();
    return s || "—";
  })();

  return (
    <div className="dash-shell create-auction-page">
      <DashboardNavbar />
      <main className="create-auction-main">
        <div className="layout-page-inner">
          <div className="create-auction-hero-container">
            <PageHeroWithFilters
              title="Edit auction"
              subtitle="Update your draft and publish when ready."
              button={{
                text: "Back to My Auctions",
                onClick: () => navigate("/dashboard/owner/auctions"),
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
            <section className="form-section">
              <h2 className="section-title">Vehicle and Odometer reading</h2>
              <p className="section-hint">
                The vehicle cannot be updated for this draft. You can change the odometer shown on the listing.
              </p>
              <div className="form-grid two-col-grid">
                <div className="form-group">
                  <label htmlFor="auction-edit-vehicle-readonly">Your vehicle</label>
                  <p
                    id="auction-edit-vehicle-readonly"
                    className="auction-edit-vehicle-readonly"
                  >
                    {vehicleDisplayLine}
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="odometer_km">Current odometer (km)</label>
                  <input
                    type="number"
                    id="odometer_km"
                    name="odometer_km"
                    value={formData.odometer_km}
                    onChange={handleInputChange}
                    min={vehicleMileage != null ? vehicleMileage : 0}
                    step="1"
                    placeholder={
                      vehicleMileage != null
                        ? `Min ${vehicleMileage.toLocaleString()} km`
                        : ""
                    }
                    className={errors.odometer_km ? "error" : ""}
                  />
                  {errors.odometer_km && (
                    <span className="field-error">{errors.odometer_km}</span>
                  )}
                </div>
              </div>
            </section>

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

            <section className="form-section">
              <h2 className="section-title">Pricing</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="reserve_price">Reserve price (PKR) <span className="required">*</span></label>
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
                  {errors.reserve_price && <span className="field-error">{errors.reserve_price}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="starting_bid">Starting bid (PKR) <span className="required">*</span></label>
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
                  {errors.starting_bid && <span className="field-error">{errors.starting_bid}</span>}
                </div>
              </div>
            </section>

            <section className="form-section">
              <h2 className="section-title">Duration & Start</h2>
              <div className="form-grid two-col-grid">
                <div className="form-group">
                  <label htmlFor="duration_days">Auction duration</label>
                  <select
                    id="duration_days"
                    name="duration_days"
                    value={formData.duration_days}
                    onChange={handleInputChange}
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d} days</option>
                    ))}
                  </select>
                </div>
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
                    className={errors.start_at ? "error" : ""}
                  />
                  {errors.start_at && (
                    <span className="field-error">{errors.start_at}</span>
                  )}
                </div>
              </div>
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

            <section className="form-section">
              <h2 className="section-title">Auction Photos</h2>
              <p className="section-hint">
                High-quality images, max {MAX_PHOTO_SIZE_MB}MB each. Min {AUCTION_PHOTOS_MIN}, max{" "}
                {AUCTION_PHOTOS_MAX} to publish. Existing photos stay unless you remove them; you can add more up to
                the limit.
              </p>
              <div className="form-grid">
                <div className="form-group full-width">
                  <div className="file-upload-wrapper file-upload-auction">
                    <input
                      ref={fileInputRef}
                      id="edit-auction-photo-input"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      multiple
                      onChange={handlePhotoInput}
                      className="file-input-hidden"
                    />
                    {totalPhotoCount > 0 && (
                      <div className="images-preview-section">
                        <div className="images-grid">
                          {existingPhotoUrls.map((url, index) => (
                            <div key={`ex-${url}-${index}`} className="image-preview-item">
                              <img
                                src={url}
                                alt={`Photo ${index + 1}`}
                                className="preview-image"
                              />
                              <span className="image-number">{index + 1}</span>
                              <button
                                type="button"
                                className="remove-image-btn"
                                onClick={() => removeExistingPhoto(index)}
                                aria-label="Remove photo"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                          {photoFiles.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="image-preview-item">
                              <img
                                src={photoPreviewUrls[index]}
                                alt={`Photo ${existingPhotoUrls.length + index + 1}`}
                                className="preview-image"
                              />
                              <span className="image-number">{existingPhotoUrls.length + index + 1}</span>
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
                    )}
                    {totalPhotoCount >= AUCTION_PHOTOS_MAX ? (
                      <div
                        className="image-dropzone auction-photo-dropzone-full is-max"
                        aria-disabled
                      >
                        <div className="image-dropzone-inner">
                          <Upload size={22} strokeWidth={2} className="auction-dropzone-luci" aria-hidden />
                          <div className="image-dropzone-text">
                            <div className="image-dropzone-title">Maximum photos reached</div>
                            <div className="image-dropzone-subtitle">
                              {AUCTION_PHOTOS_MAX} / {AUCTION_PHOTOS_MAX} · JPG, PNG or WebP · up to{" "}
                              {MAX_PHOTO_SIZE_MB}MB each
                            </div>
                          </div>
                        </div>
                        <span className="auction-photo-count-chip">
                          {totalPhotoCount}/{AUCTION_PHOTOS_MAX}
                        </span>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        className={`image-dropzone auction-photo-dropzone-full ${photoDragActive ? "is-dragover" : ""}`}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            fileInputRef.current?.click();
                          }
                        }}
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
                        <div className="image-dropzone-inner">
                          <Upload size={22} strokeWidth={2} className="auction-dropzone-luci" aria-hidden />
                          <div className="image-dropzone-text">
                            <div className="image-dropzone-title">Drag & drop</div>
                            <div className="image-dropzone-subtitle">or click to upload</div>
                          </div>
                        </div>
                        <span className="auction-photo-count-chip">
                          {totalPhotoCount}/{AUCTION_PHOTOS_MAX}
                        </span>
                      </div>
                    )}
                  </div>
                  {errors.photos && <span className="field-error">{errors.photos}</span>}
                </div>
              </div>
            </section>

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

            <div className="form-actions">
              <button
                type="button"
                onClick={() => navigate("/dashboard/owner/auctions")}
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
              <button type="submit" disabled={loadingSubmit} className="btn-primary">
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

export default EditAuctionPage;
