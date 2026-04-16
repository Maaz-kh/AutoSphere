import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CircleUser, LogOut, ChevronDown, Menu, X } from 'lucide-react';
import logoImage from '../assets/autosphere_logo.png';
import '../styles/DashboardNavbar.css';

function getDisplayName(u) {
  if (u?.full_name?.trim()) return u.full_name.trim();
  if (u?.email) {
    const local = u.email.split('@')[0];
    return local
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return 'User';
}

function getProfilePath(role) {
  switch (role) {
    case 'vehicle_owner':
      return '/dashboard/owner/profile';
    case 'buyer':
      return '/dashboard/buyer/profile';
    case 'workshop':
      return '/dashboard/workshop/profile';
    default:
      return null;
  }
}

function getRoleLabel(role) {
  switch (role) {
    case 'vehicle_owner':
      return 'Vehicle Owner';
    case 'buyer':
      return 'Buyer';
    case 'workshop':
      return 'Workshop';
    case 'admin':
      return 'Administrator';
    default:
      return 'User';
  }
}

const DashboardNavbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  const profilePath = getProfilePath(user?.role);
  const displayName = getDisplayName(user);
  const roleLabel = getRoleLabel(user?.role);

  // Role-specific navigation items (flat link or dropdown with children). My Profile lives in account menu.
  const getNavItems = () => {
    switch (user?.role) {
      case 'vehicle_owner':
        return [
          { label: 'Vehicles', dropdown: true, children: [
            { label: 'My Vehicles', path: '/dashboard/owner' },
            { label: 'Register Vehicle', path: '/dashboard/owner/register' }
          ]},
          { label: 'Auctions', dropdown: true, children: [
            { label: 'Create Auction', path: '/dashboard/owner/auctions/create' },
            { label: 'My Auctions', path: '/dashboard/owner/auctions' },
            { label: 'My Bids', path: '/dashboard/owner/bids' },
            { label: 'Browse Auctions', path: '/dashboard/owner/auctions/browse' }
          ]},
          { label: 'Browse Workshops', path: '/dashboard/owner/workshops' },
          { label: 'Appointments', path: '/dashboard/owner/appointments' },
          { label: 'Service History', path: '/dashboard/owner/history' },
          { label: 'Valuation', path: '/dashboard/owner/valuation' },
          { label: 'Damage Detection', path: '/dashboard/owner/damage-detection' }
        ];
      case 'buyer':
        return [
          { label: 'Dashboard', path: '/dashboard/buyer' },
          { label: 'Browse Auctions', path: '/dashboard/buyer/auctions' },
          { label: 'Browse Workshops', path: '/dashboard/buyer/workshops' },
          { label: 'My Bids', path: '/dashboard/buyer/bids' }
        ];
      case 'workshop':
        return [
          { label: 'Dashboard', path: '/dashboard/workshop' },
          { label: 'Inventory', path: '/dashboard/workshop/inventory' },
          { label: 'Add Service Record', path: '/dashboard/workshop/add-service' },
          { label: 'Services Offered', path: '/dashboard/workshop/services' },
          { label: 'Appointments', path: '/dashboard/workshop/appointments' },
          { label: 'Service History', path: '/dashboard/workshop/history' }
        ];
      case 'admin':
        return [
          { label: 'Dashboard', path: '/dashboard/admin' },
          { label: 'Users', path: '/dashboard/admin/users' },
          { label: 'Vehicles', path: '/dashboard/admin/vehicles' },
          { label: 'Workshops', path: '/dashboard/admin/workshops' },
          { label: 'Reports', path: '/dashboard/admin/reports' }
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  return (
    <nav className="dashboard-navbar">
      <div className="navbar-container">
        {/* Logo/Brand Section */}
        <div className="navbar-brand">
          <Link
            to={`/dashboard/${user?.role === 'vehicle_owner' ? 'owner' : user?.role}`}
            className="brand-link"
          >
            <img src={logoImage} alt="AutoSphere Logo" className="brand-logo" />
          </Link>
        </div>

        {/* Navigation Items */}
        <div className="navbar-nav">
          {navItems.map((item, index) => {
            if (item.dropdown && item.children) {
              const isActive = item.children.some((c) => c.path && location.pathname === c.path);
              return (
                <div
                  key={index}
                  className="nav-dropdown"
                  onMouseEnter={() => setOpenDropdown(index)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    type="button"
                    className={`nav-item nav-item-trigger ${isActive ? 'active' : ''}`}
                    onClick={() => setOpenDropdown(openDropdown === index ? null : index)}
                    aria-expanded={openDropdown === index}
                    aria-haspopup="true"
                  >
                    <span className="nav-label">{item.label}</span>
                    <ChevronDown size={12} strokeWidth={2.25} className="nav-dropdown-chevron" aria-hidden />
                  </button>
                  {openDropdown === index && (
                    <div className="nav-dropdown-menu" role="menu">
                      {item.children.map((child, childIndex) => (
                        <Link
                          key={childIndex}
                          to={child.path}
                          className={`nav-dropdown-item ${location.pathname === child.path ? 'active' : ''}`}
                          onClick={() => setOpenDropdown(null)}
                          role="menuitem"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link
                key={index}
                to={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* User Account — filled profile icon; menu: name, My profile, Sign out */}
        <div className="navbar-user">
          <button
            type="button"
            className={`user-menu-trigger ${showUserMenu ? 'is-open' : ''}`}
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-expanded={showUserMenu}
            aria-haspopup="true"
            aria-label="Account menu"
          >
            <span className="user-menu-trigger-inner">
              <span className="user-menu-profile-glyph" aria-hidden>
                <CircleUser className="user-menu-profile-icon" size={22} strokeWidth={1.75} />
              </span>
              <span className="user-menu-account-label">Account</span>
            </span>
          </button>

          {showUserMenu && (
            <>
              <div
                className="user-menu-overlay"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="user-menu">
                <div className="user-menu-body">
                  <p className="user-menu-display-name">{displayName}</p>
                  <p className="user-menu-role-line">{roleLabel}</p>
                  {profilePath && (
                    <Link
                      to={profilePath}
                      className="user-menu-pill"
                      onClick={() => setShowUserMenu(false)}
                    >
                      My profile
                    </Link>
                  )}
                  <button
                    type="button"
                    className="user-menu-pill"
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle Button */}
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          aria-label="Toggle menu"
        >
          {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Sidebar Menu */}
      {showMobileMenu && (
        <>
          <div
            className="mobile-menu-overlay"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className="mobile-menu-sidebar">
            <div className="mobile-menu-header">
              <div className="mobile-menu-user">
                <div className="mobile-menu-profile-glyph" aria-hidden>
                  <CircleUser className="user-menu-profile-icon" size={26} strokeWidth={1.75} />
                </div>
                <div className="mobile-menu-user-info">
                  <div className="mobile-menu-name">{displayName}</div>
                  <div className="mobile-menu-role">
                    {user?.role === 'vehicle_owner' ? 'Vehicle Owner' :
                     user?.role === 'buyer' ? 'Buyer' :
                     user?.role === 'workshop' ? 'Workshop' :
                     user?.role === 'admin' ? 'Administrator' : 'User'}
                  </div>
                  {profilePath && (
                    <Link
                      to={profilePath}
                      className="mobile-menu-profile-cta"
                      onClick={() => setShowMobileMenu(false)}
                    >
                      My profile
                    </Link>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="mobile-menu-close"
                onClick={() => setShowMobileMenu(false)}
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mobile-menu-nav">
              {navItems.map((item, index) => {
                if (item.dropdown && item.children) {
                  return (
                    <div key={index} className="mobile-nav-group">
                      <div className="mobile-nav-group-label">{item.label}</div>
                      {item.children.map((child, childIndex) => (
                        <Link
                          key={childIndex}
                          to={child.path}
                          className={`mobile-nav-item mobile-nav-item-nested ${location.pathname === child.path ? 'active' : ''}`}
                          onClick={() => setShowMobileMenu(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  );
                }
                return (
                  <Link
                    key={index}
                    to={item.path}
                    className={`mobile-nav-item ${location.pathname === item.path ? 'active' : ''}`}
                    onClick={() => setShowMobileMenu(false)}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mobile-menu-footer">
              <button
                type="button"
                className="mobile-menu-logout"
                onClick={() => {
                  setShowMobileMenu(false);
                  logout();
                }}
              >
                <LogOut size={20} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </nav>
  );
};

export default DashboardNavbar;
