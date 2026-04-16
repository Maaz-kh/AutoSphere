import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';
import { apiClient } from '../services/api';
import '../styles/PartModal.css';

const PartModal = ({ part, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    part_name: '',
    category: 'parts',
    price: '',
    quantity: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (part) {
      setFormData({
        part_name: part.part_name || '',
        category: part.category || 'parts',
        price: part.price || '',
        quantity: part.quantity || ''
      });
    } else {
      // Reset to defaults for new part
      setFormData({
        part_name: '',
        category: 'parts',
        price: '',
        quantity: ''
      });
    }
  }, [part]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.part_name.trim()) {
      newErrors.part_name = 'Part name is required';
    }

    if (!formData.price || parseFloat(formData.price) < 0) {
      newErrors.price = 'Price must be a positive number';
    }

    if (formData.quantity === '' || parseInt(formData.quantity, 10) < 0) {
      newErrors.quantity = 'Quantity must be a non-negative number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      const payload = {
        part_name: formData.part_name.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        quantity: parseInt(formData.quantity, 10)
      };

      if (part) {
        // Update existing part
        await apiClient.put(`/workshop/parts/${part.id}`, payload);
        toast.success('Part updated successfully');
      } else {
        // Create new part
        await apiClient.post('/workshop/parts', payload);
        toast.success('Part added successfully');
      }

      onSuccess();
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        `Failed to ${part ? 'update' : 'add'} part. Please try again.`;
      toast.error(msg);

      // Handle validation errors
      if (error?.response?.data?.errors) {
        const validationErrors = {};
        error.response.data.errors.forEach((err) => {
          if (err.param) {
            validationErrors[err.param] = err.msg;
          }
        });
        setErrors(validationErrors);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content part-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {part ? 'Edit Inventory Item' : 'Add Inventory Item'}
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-field">
            <label htmlFor="part_name">
              Item Name <span className="required">*</span>
            </label>
            <input
              id="part_name"
              name="part_name"
              type="text"
              value={formData.part_name}
              onChange={handleChange}
              placeholder="Enter item name"
              required
            />
            {errors.part_name && (
              <span className="field-error">{errors.part_name}</span>
            )}
          </div>

          <div className="modal-field">
            <label htmlFor="category">
              Category <span className="required">*</span>
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="parts">Parts</option>
              <option value="fluids">Fluids</option>
              <option value="filters">Filters</option>
            </select>
            {errors.category && (
              <span className="field-error">{errors.category}</span>
            )}
          </div>

          <div className="modal-field">
            <label htmlFor="price">
              Price (Rs.) <span className="required">*</span>
            </label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={handleChange}
              placeholder="0.00"
              required
            />
            {errors.price && (
              <span className="field-error">{errors.price}</span>
            )}
          </div>

          <div className="modal-field">
            <label htmlFor="quantity">
              Quantity <span className="required">*</span>
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min="0"
              value={formData.quantity}
              onChange={handleChange}
              placeholder="0"
              required
            />
            {errors.quantity && (
              <span className="field-error">{errors.quantity}</span>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="ui-btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ui-btn-primary"
              disabled={loading}
            >
              {loading ? 'Saving...' : part ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartModal;

