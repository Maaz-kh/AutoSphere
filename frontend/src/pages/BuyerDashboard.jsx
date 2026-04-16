import DashboardNavbar from '../components/DashboardNavbar';
import '../styles/Dashboard.css';

const BuyerDashboard = () => {
  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="dash-main">
        <section className="dash-card">
          <h1>Welcome, buyer</h1>
          <p>Here you will be able to browse and monitor vehicles in future iterations.</p>
        </section>
      </main>
    </div>
  );
};

export default BuyerDashboard;

