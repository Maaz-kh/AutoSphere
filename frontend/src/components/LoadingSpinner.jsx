import PropTypes from 'prop-types';
import '../styles/LoadingSpinner.css';

const LoadingSpinner = ({ message }) => {
  return (
    <div className="loading-spinner-wrapper" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      {message && <p className="loading-spinner-message">{message}</p>}
    </div>
  );
};

LoadingSpinner.propTypes = {
  message: PropTypes.string
};

export default LoadingSpinner;
