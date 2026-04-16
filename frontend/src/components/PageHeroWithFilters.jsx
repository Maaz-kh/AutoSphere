import PropTypes from 'prop-types';
import '../styles/PageHeroWithFilters.css';

const PageHeroWithFilters = ({
  title,
  subtitle,
  button,
  filters = [],
  showAdvancedFilter = true
}) => {
  const hasFilters = filters.length > 0;
  const showAdvanced = hasFilters && showAdvancedFilter;

  const getIsPlaceholderValue = (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '' || value === 'all';
    return false;
  };

  return (
    <section className="page-hero">
      <h1 className="page-hero-title">{title}</h1>
      <p className="page-hero-subtitle">{subtitle}</p>

      {/* Filters live inside the hero (PakWheels-style) */}
      {hasFilters && (
        <div className="page-filter-shell">
          <div className="page-filters-pill">
            {filters.map((filter, index) => (
              <div
                key={filter.name || index}
                className={`page-filter-field ${filter.width === 'wide' ? 'page-filter-wide' : ''}`}
              >
                <div className={`page-filter-control ${filter.type === 'date' ? 'page-filter-control-date' : ''}`}>
                  {filter.type === 'search' ? (
                    <input
                      type="text"
                      placeholder={filter.placeholder || 'Search...'}
                      value={filter.value || ''}
                      aria-label={filter.label}
                      className={getIsPlaceholderValue(filter.value) ? 'is-placeholder' : ''}
                      onChange={(e) => filter.onChange(e.target.value)}
                    />
                  ) : filter.type === 'number' ? (
                    <input
                      type="number"
                      placeholder={filter.placeholder || ''}
                      value={filter.value ?? ''}
                      min={filter.min}
                      max={filter.max}
                      aria-label={filter.label}
                      className={getIsPlaceholderValue(filter.value) ? 'is-placeholder' : ''}
                      onChange={(e) => filter.onChange(e.target.value === '' ? '' : e.target.value)}
                    />
                  ) : filter.type === 'date' ? (
                    <>
                      <input
                        type="date"
                        value={filter.value || ''}
                        aria-label={filter.label}
                        className={getIsPlaceholderValue(filter.value) ? 'is-placeholder' : ''}
                        onChange={(e) => filter.onChange(e.target.value)}
                      />
                      {getIsPlaceholderValue(filter.value) && filter.placeholder && (
                        <span className="page-date-placeholder" aria-hidden="true">
                          {filter.placeholder}
                        </span>
                      )}
                    </>
                  ) : (
                    <select
                      value={filter.value || ''}
                      aria-label={filter.label}
                      className={getIsPlaceholderValue(filter.value) ? 'is-placeholder' : ''}
                      onChange={(e) => filter.onChange(e.target.value)}
                    >
                      {filter.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA buttons below the filter bar */}
      {(showAdvanced || button) && (
        <div className="page-hero-actions">
          {showAdvanced && (
            <button
              type="button"
              className="advanced-filter-btn"
              onClick={() => {}}
              aria-label="Advanced filters (coming soon)"
              title="Advanced filters (coming soon)"
            >
              Advanced Filter
            </button>
          )}

          {button && (
            <button
              type="button"
              className="primary-btn"
              onClick={button.onClick}
            >
              {button.text}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

PageHeroWithFilters.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
  showAdvancedFilter: PropTypes.bool,
  button: PropTypes.shape({
    text: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired
  }),
  filters: PropTypes.arrayOf(
    PropTypes.shape({
      type: PropTypes.oneOf(['search', 'select', 'date', 'number']).isRequired,
      label: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      onChange: PropTypes.func.isRequired,
      width: PropTypes.oneOf(['default', 'wide']),
      placeholder: PropTypes.string,
      options: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
          label: PropTypes.string.isRequired
        })
      )
    })
  )
};

export default PageHeroWithFilters;

