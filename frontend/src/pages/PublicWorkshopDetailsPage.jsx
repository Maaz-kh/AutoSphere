import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, MapPin, Phone } from 'lucide-react';
import DashboardNavbar from '../components/DashboardNavbar';
import PageHeroWithFilters from '../components/PageHeroWithFilters';
import { apiClient } from '../services/api';
import '../styles/Dashboard.css';
import '../styles/PublicWorkshopDetailsPage.css';

const priceLabel = (min, max) => {
  const fmt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
  };
  const a = min == null ? null : fmt(min);
  const b = max == null ? null : fmt(max);
  if (!a && !b) return 'Price not set';
  if (a && b) return `PKR ${a} - ${b}`;
  if (a) return `From PKR ${a}`;
  return `Up to PKR ${b}`;
};

const PublicWorkshopDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/public/workshops/${id}`);
        setData(res.data?.data || null);
      } catch (error) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to load workshop details.';
        toast.error(msg);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id]);

  const mapsLink = useMemo(() => {
    if (!data?.latitude || !data?.longitude) return null;
    const lat = encodeURIComponent(String(data.latitude));
    const lng = encodeURIComponent(String(data.longitude));
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }, [data?.latitude, data?.longitude]);

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="workshop-details-main">
        <div className="layout-page-inner">
        <PageHeroWithFilters
          title={data?.name || 'Workshop Details'}
          subtitle="Verified workshop profile and services."
          button={{
            text: 'Back',
            onClick: () => navigate(-1)
          }}
        />

        <div className="workshop-details-body">
        <section className="workshop-details-card">
          {loading ? (
            <div className="workshop-details-empty">Loading…</div>
          ) : !data ? (
            <div className="workshop-details-empty">
              Workshop not found.
              <div style={{ marginTop: '0.75rem' }}>
                <button type="button" className="wd-back-btn" onClick={() => navigate(-1)}>
                  <ArrowLeft size={16} /> Go back
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="wd-top">
                <div className="wd-title-row">
                  <div className="wd-name">{data.name}</div>
                  <span className="wd-verified">Verified</span>
                </div>

                <div className="wd-meta">
                  <div className="wd-meta-item">
                    <MapPin size={16} />
                    <span>{[data.city, data.country].filter(Boolean).join(', ')}</span>
                  </div>
                  {data.contact_phone && (
                    <div className="wd-meta-item">
                      <Phone size={16} />
                      <span>{data.contact_phone}</span>
                    </div>
                  )}
                </div>

                {data.address && <div className="wd-address">{data.address}</div>}

                {mapsLink && (
                  <a className="wd-maps-link" href={mapsLink} target="_blank" rel="noreferrer">
                    View on Google Maps
                  </a>
                )}
              </div>

              <div className="wd-services">
                <div className="wd-section-title">Services Offered</div>
                {Array.isArray(data.services) && data.services.length > 0 ? (
                  <div className="wd-services-grid">
                    {data.services.map((s) => (
                      <div key={s.id} className="wd-service-card">
                        <div className="wd-service-name">{s.name}</div>
                        <div className="wd-service-meta">
                          <span className="wd-pill">{s.category}</span>
                        </div>
                        <div className="wd-service-price">{priceLabel(s.price_min, s.price_max)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="workshop-details-empty">No services listed yet.</div>
                )}
              </div>
            </>
          )}
        </section>
        </div>
        </div>
      </main>
    </div>
  );
};

export default PublicWorkshopDetailsPage;

