import '../styles/AuthLayout.css';

const AuthLayout = ({ children }) => {
  return (
    <div className="auth-shell">
      <main className="auth-main">
        <div className="auth-panel">{children}</div>
      </main>
      <footer className="auth-footer">
        <p>© {new Date().getFullYear()} AutoSphere. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default AuthLayout;

