import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import App from './App';
import './styles/global.css';
import './styles/Dashboard.css';
import './styles/Toast.css';

// Custom toast icons from lucide-react (white color via inline styles)
const SuccessIcon = () => <CheckCircle2 size={20} style={{ color: 'white', stroke: 'white' }} className="toast-icon-white" />;
const ErrorIcon = () => <XCircle size={20} style={{ color: 'white', stroke: 'white' }} className="toast-icon-white" />;
const InfoIcon = () => <Info size={20} style={{ color: 'white', stroke: 'white' }} className="toast-icon-white" />;
const WarningIcon = () => <AlertTriangle size={20} style={{ color: 'white', stroke: 'white' }} className="toast-icon-white" />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        icon={({ type }) => {
          switch (type) {
            case 'success':
              return <SuccessIcon />;
            case 'error':
              return <ErrorIcon />;
            case 'info':
              return <InfoIcon />;
            case 'warning':
              return <WarningIcon />;
            default:
              return null;
          }
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
