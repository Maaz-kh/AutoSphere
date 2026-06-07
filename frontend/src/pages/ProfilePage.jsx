import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import DashboardNavbar from '../components/DashboardNavbar';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/ProfilePage.css';

const ProfilePage = () => {
  const [loading, setLoading] = useState(true);
  const [savingOwner, setSavingOwner] = useState(false);
  const [savingWorkshop, setSavingWorkshop] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState(false);
  const [profile, setProfile] = useState(null);
  const [ownerForm, setOwnerForm] = useState({});
  const [workshopForm, setWorkshopForm] = useState({});
  const fileInputRef = useRef(null);
  const { user } = useAuth();

  // Check if user is a workshop
  const isWorkshop = user?.role === 'workshop';

  // Use email initials for consistency with navbar
  const initials = useMemo(() => {
    const email = user?.email || profile?.email || '';
    return email.charAt(0).toUpperCase() || 'U';
  }, [user?.email, profile?.email]);

  // Get dynamic header text based on role
  const getHeaderName = () => {
    if (ownerForm.full_name) return ownerForm.full_name;
    if (isWorkshop) return 'Workshop Owner';
    if (user?.role === 'vehicle_owner') return 'Vehicle Owner';
    if (user?.role === 'buyer') return 'Buyer';
    return 'User';
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/profile');
      const data = res.data?.data || {};
      setProfile(data);
      setOwnerForm({
        full_name: data.full_name || '',
        email: data.email || '',
        phone_number: data.phone_number || '',
        cnic: data.cnic || '',
        cnic_image: data.cnic_image || '',
        address: data.address || '',
        city: data.city || '',
        country: data.country || ''
      });
      // Only set workshop form if user is a workshop
      if (isWorkshop) {
        setWorkshopForm({
          business_name: data.business_name || '',
          workshop_ntn: data.workshop_ntn || '',
          workshop_city: data.workshop_city || '',
          workshop_country: data.workshop_country || '',
          workshop_address: data.workshop_address || ''
        });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role) {
      fetchProfile();
    }
  }, [user?.role]);

  const handleOwnerChange = (e) => {
    const { name, value } = e.target;
    setOwnerForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleWorkshopChange = (e) => {
    const { name, value } = e.target;
    setWorkshopForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleOwnerSave = async () => {
    try {
      setSavingOwner(true);
      const payload = {
        full_name: ownerForm.full_name,
        phone_number: ownerForm.phone_number,
        cnic: ownerForm.cnic,
        address: ownerForm.address,
        city: ownerForm.city,
        country: ownerForm.country
      };
      const res = await apiClient.put('/profile', payload);
      setProfile(res.data?.data);
      setEditingOwner(false);
      toast.success('Profile details updated successfully');
    } catch (error) {
      console.error('Failed to save profile details:', error);
      const errorMsg = error?.response?.data?.message || 'Failed to save profile details';
      toast.error(errorMsg);
    } finally {
      setSavingOwner(false);
    }
  };

  const handleWorkshopSave = async () => {
    try {
      setSavingWorkshop(true);
      const payload = { ...workshopForm };
      const res = await apiClient.put('/profile', payload);
      setProfile(res.data?.data);
      setEditingWorkshop(false);
      toast.success('Workshop details updated successfully');
    } catch (error) {
      console.error('Failed to save workshop details:', error);
      const errorMsg = error?.response?.data?.message || 'Failed to save workshop details';
      toast.error(errorMsg);
    } finally {
      setSavingWorkshop(false);
    }
  };

  const handleImageClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('profile_image', file);
    try {
      setUploadingImage(true);
      const res = await apiClient.post('/profile/image', formData);
      setProfile((prev) => ({ ...prev, profile_image: res.data?.data?.profile_image }));
      toast.success('Profile image updated successfully');
    } catch (error) {
      console.error('Failed to upload profile image:', error);
      const errorMsg = error?.response?.data?.message || 'Failed to upload profile image';
      toast.error(errorMsg);
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const renderOwnerFields = () => (
    <div className="profile-grid two-col">
      <div className="form-group">
        <label>Full Name</label>
        <input
          name="full_name"
          value={ownerForm.full_name}
          onChange={handleOwnerChange}
          disabled={!editingOwner}
          placeholder="Enter full name"
        />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input value={ownerForm.email} disabled />
      </div>
      <div className="form-group">
        <label>Phone Number</label>
        <input
          name="phone_number"
          value={ownerForm.phone_number}
          onChange={handleOwnerChange}
          disabled={!editingOwner}
          placeholder="03XXXXXXXXX"
        />
      </div>
      <div className="form-group">
        <label>CNIC</label>
        <input
          name="cnic"
          value={ownerForm.cnic}
          onChange={handleOwnerChange}
          disabled={!editingOwner}
          placeholder="CNIC"
        />
      </div>
      <div className="form-group">
        <label>Country</label>
        <input
          name="country"
          value={ownerForm.country}
          onChange={handleOwnerChange}
          disabled={!editingOwner}
          placeholder="Country"
        />
      </div>
      <div className="form-group">
        <label>City</label>
        <input
          name="city"
          value={ownerForm.city}
          onChange={handleOwnerChange}
          disabled={!editingOwner}
          placeholder="City"
        />
      </div>
      <div className="form-group">
        <label>Address</label>
        <input
          name="address"
          value={ownerForm.address}
          onChange={handleOwnerChange}
          disabled={!editingOwner}
          placeholder="Address"
        />
      </div>
      {ownerForm.cnic_image && (
        <div className="form-group cnic-image-group">
          <label>CNIC Image</label>
          <div className="cnic-image-box">
            <img src={ownerForm.cnic_image} alt="CNIC" />
          </div>
        </div>
      )}
    </div>
  );

  const renderWorkshopFields = () => (
    <div className="profile-grid two-col">
      <div className="form-group">
        <label>Workshop Name</label>
        <input
          name="business_name"
          value={workshopForm.business_name}
          onChange={handleWorkshopChange}
          disabled={!editingWorkshop}
          placeholder="Workshop business name"
        />
      </div>
      <div className="form-group">
        <label>Workshop NTN</label>
        <input
          name="workshop_ntn"
          value={workshopForm.workshop_ntn}
          onChange={handleWorkshopChange}
          disabled={!editingWorkshop}
          placeholder="NTN"
        />
      </div>
      <div className="form-group">
        <label>Workshop Country</label>
        <input
          name="workshop_country"
          value={workshopForm.workshop_country}
          onChange={handleWorkshopChange}
          disabled={!editingWorkshop}
          placeholder="Country"
        />
      </div>
      <div className="form-group">
        <label>Workshop City</label>
        <input
          name="workshop_city"
          value={workshopForm.workshop_city}
          onChange={handleWorkshopChange}
          disabled={!editingWorkshop}
          placeholder="City"
        />
      </div>
      <div className="form-group full-width">
        <label>Workshop Address</label>
        <input
          name="workshop_address"
          value={workshopForm.workshop_address}
          onChange={handleWorkshopChange}
          disabled={!editingWorkshop}
          placeholder="Address"
        />
      </div>
    </div>
  );

  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="profile-main">
        <div className="layout-page-inner profile-container">
          {loading ? (
            <div className="profile-loading">Loading profile...</div>
          ) : (
            <>
              <div className="profile-header">
                <div className="profile-avatar" onClick={handleImageClick} title="Click to change">
                  {uploadingImage ? (
                    <span className="avatar-loading">...</span>
                  ) : profile?.profile_image ? (
                    <img src={profile.profile_image} alt="Profile" />
                  ) : (
                    <span>{initials}</span>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden-file-input"
                    onChange={handleImageChange}
                  />
                </div>
                <div className="profile-header-text">
                  <h2>{getHeaderName()}</h2>
                  <p>{profile?.email}</p>
                </div>
              </div>

              <div className="profile-sections">
                <section className={`profile-card ${editingOwner ? 'editing' : ''}`}>
                  <div className="profile-card-header">
                    <h3>{isWorkshop ? 'Owner Details' : 'Personal Details'}</h3>
                    <div className="profile-card-actions">
                      {editingOwner ? (
                        <>
                          <button
                            type="button"
                            className="ui-btn-secondary"
                            onClick={() => {
                              setEditingOwner(false);
                              setOwnerForm({
                                full_name: profile?.full_name || '',
                                email: profile?.email || '',
                                phone_number: profile?.phone_number || '',
                                cnic: profile?.cnic || '',
                                cnic_image: profile?.cnic_image || '',
                                address: profile?.address || '',
                                city: profile?.city || '',
                                country: profile?.country || ''
                              });
                            }}
                            disabled={savingOwner}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="ui-btn-primary"
                            onClick={handleOwnerSave}
                            disabled={savingOwner}
                          >
                            {savingOwner ? 'Saving...' : 'Save'}
                          </button>
                        </>
                      ) : (
                        <button type="button" className="ui-btn-primary" onClick={() => setEditingOwner(true)}>
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  {renderOwnerFields()}
                </section>

                {isWorkshop && (
                  <section className={`profile-card ${editingWorkshop ? 'editing' : ''}`}>
                    <div className="profile-card-header">
                      <h3>Workshop Details</h3>
                      <div className="profile-card-actions">
                        {editingWorkshop ? (
                          <>
                            <button
                              type="button"
                              className="ui-btn-secondary"
                              onClick={() => {
                                setEditingWorkshop(false);
                                setWorkshopForm({
                                  business_name: profile?.business_name || '',
                                  workshop_ntn: profile?.workshop_ntn || '',
                                  workshop_city: profile?.workshop_city || '',
                                  workshop_country: profile?.workshop_country || '',
                                  workshop_address: profile?.workshop_address || ''
                                });
                              }}
                              disabled={savingWorkshop}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="ui-btn-primary"
                              onClick={handleWorkshopSave}
                              disabled={savingWorkshop}
                            >
                              {savingWorkshop ? 'Saving...' : 'Save'}
                            </button>
                          </>
                        ) : (
                          <button type="button" className="ui-btn-primary" onClick={() => setEditingWorkshop(true)}>
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    {renderWorkshopFields()}
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;

