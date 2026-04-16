import PropTypes from 'prop-types';
import '../styles/PriceRangeBar.css';


const PriceRangeBar = ({ predictedPrice, minPrice, maxPrice, formatPrice }) => {
  // Default price formatter
  const defaultFormatPrice = (price) => {
    if (price >= 1000000) {
      return `PKR ${(price / 100000).toFixed(1)} Lacs`;
    }
    return `PKR ${price.toLocaleString()}`;
  };

  const format = formatPrice || defaultFormatPrice;

  // Calculate position percentage for the predicted price indicator
  const range = maxPrice - minPrice;
  const positionFromMin = predictedPrice - minPrice;
  const positionPercentage = range > 0 ? (positionFromMin / range) * 100 : 50;

  // Ensure percentage is within bounds (0-100)
  const clampedPercentage = Math.max(0, Math.min(100, positionPercentage));

  return (
    <div className="price-range-container">
      {/* Predicted Price Display */}
      <div className="predicted-price-section">
        <div className="predicted-price-value">{format(predictedPrice)}</div>
      </div>

      {/* Recommended Price Range Section */}
      <div className="price-range-section">
        <div className="price-range-label">Recommended Price Range</div>

        <div className="price-range-visual-wrapper">
          <div className="price-range-visual">
            {/* Range Bar Container */}
            <div className="price-bar-container">
              <div className="price-bar"></div>
              <div
                className="price-indicator-dot-on-bar"
                style={{ left: `${clampedPercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Min/Max below the bar */}
          <div className="price-range-minmax">
            <div className="price-endpoint price-min">
              <div className="price-endpoint-label">Min</div>
              <div className="price-endpoint-value">{format(minPrice)}</div>
            </div>
            <div className="price-endpoint price-max">
              <div className="price-endpoint-label">Max</div>
              <div className="price-endpoint-value">{format(maxPrice)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

PriceRangeBar.propTypes = {
  predictedPrice: PropTypes.number.isRequired,
  minPrice: PropTypes.number.isRequired,
  maxPrice: PropTypes.number.isRequired,
  formatPrice: PropTypes.func
};

export default PriceRangeBar;

