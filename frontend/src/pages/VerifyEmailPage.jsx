import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthLayout from '../components/AuthLayout';
import { apiClient } from '../services/api';
import '../styles/AuthForms.css';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const hasVerified = useRef(false); // Prevent duplicate verification attempts

  useEffect(() => {
    // Prevent duplicate verification attempts (React StrictMode runs effects twice in dev)
    if (hasVerified.current) {
      return;
    }

    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Verification token is missing.');
        return;
      }

      hasVerified.current = true; // Mark as attempted
      setStatus('loading');
      
      try {
        const response = await apiClient.get(`/auth/verify-email/${token}`);
        const responseData = response.data;
        
        setStatus('success');
        const successMsg = responseData.message || 'Your email has been verified. You can now log in to your account.';
        setMessage(successMsg);
        toast.success(successMsg);
      } catch (err) {
        const msg =
          err?.response?.data?.message || err?.message || 'Failed to verify email. Please try again.';
        
        // If token is already used, it means the account is already verified
        // This can happen due to React StrictMode double-rendering or user clicking link twice
        // Backend now handles this case, but keep this as fallback
        if (msg.toLowerCase().includes('token already used') || 
            msg.toLowerCase().includes('already been verified')) {
          setStatus('success');
          const successMsg = 'Your email has already been verified. You can log in to your account.';
          setMessage(successMsg);
          toast.success(successMsg);
        } else {
          setStatus('error');
          setMessage(msg);
          toast.error(msg);
        }
      }
    };

    verify();
  }, [token]);

  return (
    <AuthLayout>
      <div className="auth-form">
        {status === 'loading' && (
          <div className="auth-alert auth-alert-info">Verifying your email, please wait…</div>
        )}

        {status === 'success' && (
          <div className="verification-success-container">
            <h1 className="verification-success-heading">Verification Successful</h1>
            <p className="verification-success-message">{message}</p>
            <p className="verification-login-text">
              Please click here to{' '}
              <Link to="/login" className="verification-login-link">login</Link>.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="auth-alert auth-alert-error">
            <p>{message}</p>
            <p style={{ marginTop: '0.75rem' }}>
              You can request a new verification email from the login screen if needed.
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
};

export default VerifyEmailPage;

