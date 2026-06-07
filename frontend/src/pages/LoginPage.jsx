import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import logoImage from '../assets/autosphere_logo_main.png';
import '../styles/AuthForms.css';

const LoginPage = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Unable to login at the moment. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-logo-container">
          <img src={logoImage} alt="AutoSphere Logo" className="auth-logo" />
        </div>
        <div className="auth-form-header">
          <h2 className="auth-form-title">Welcome Back</h2>
          <p className="auth-form-subtitle">Login with your registered email address</p>
        </div>

        <div className="auth-form-body">
          <div className="auth-form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="auth-form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
        </div>

          <button type="submit" className="auth-button-primary" disabled={loading}>
            {loading ? 'Signing you in…' : 'Login'}
          </button>

          <p className="auth-form-footer">
            Don&apos;t have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};

export default LoginPage;

