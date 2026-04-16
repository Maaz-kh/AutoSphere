import DashboardNavbar from '../components/DashboardNavbar';
import '../styles/Dashboard.css';

const WorkshopDashboard = () => {
  return (
    <div className="dash-shell">
      <DashboardNavbar />
      <main className="dash-main">
        <section className="dash-card">
          <h1>Welcome, workshop</h1>
          <p>Later this will display vehicles assigned to your workshop and service history.</p>
        </section>
      </main>
    </div>
  );
};

export default WorkshopDashboard;

