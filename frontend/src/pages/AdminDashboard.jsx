import DashboardNavbar from '../components/DashboardNavbar';
import '../styles/Dashboard.css';

const AdminDashboard = () => {
  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="dash-main">
        <section className="dash-card">
          <h1>Welcome, admin</h1>
          <p>This is the starting point for managing users, vehicles and approvals.</p>
        </section>
      </main>
    </div>
  );
};

export default AdminDashboard;

