import { Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import BuyerDashboard from './pages/BuyerDashboard';
import WorkshopDashboard from './pages/WorkshopDashboard';
import AdminDashboard from './pages/AdminDashboard';
import RegisterVehiclePage from './pages/RegisterVehiclePage';
import MyVehiclesPage from './pages/MyVehiclesPage';
import InventoryPage from './pages/InventoryPage';
import AddServicePage from './pages/AddServicePage';
import ServicesOfferedPage from './pages/ServicesOfferedPage';
import ServiceHistoryPage from './pages/ServiceHistoryPage';
import OwnerServiceHistoryPage from './pages/OwnerServiceHistoryPage';
import ProfilePage from './pages/ProfilePage';
import VehicleValuationPage from './pages/VehicleValuationPage';
import VehicleDamageDetectionPage from './pages/VehicleDamageDetectionPage';
import VehicleDetailsPage from './pages/VehicleDetailsPage';
import CreateAuctionPage from './pages/CreateAuctionPage';
import EditAuctionPage from './pages/EditAuctionPage';
import MyAuctionsPage from './pages/MyAuctionsPage';
import AuctionDetailsPage from './pages/AuctionDetailsPage';
import BrowseAuctionsPage from './pages/BrowseAuctionsPage';
import PublicAuctionDetailPage from './pages/PublicAuctionDetailPage';
import TransactionPage from './pages/TransactionPage';
import MyBidsPage from './pages/MyBidsPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import BrowseWorkshopsPage from './pages/BrowseWorkshopsPage';
import PublicWorkshopDetailsPage from './pages/PublicWorkshopDetailsPage';
import OwnerAppointmentsPage from './pages/OwnerAppointmentsPage';
import WorkshopAppointmentsPage from './pages/WorkshopAppointmentsPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route
          path="/dashboard/owner"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <MyVehiclesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/register"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <RegisterVehiclePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/history"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <OwnerServiceHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/profile"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/workshops"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <BrowseWorkshopsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/workshops/:id"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <PublicWorkshopDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/appointments"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <OwnerAppointmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/valuation"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <VehicleValuationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/damage-detection"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <VehicleDamageDetectionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/vehicle/:vehicleId"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <VehicleDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/auctions/create"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <CreateAuctionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/auctions"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <MyAuctionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/auctions/browse"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <BrowseAuctionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/auctions/view/:auctionId"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <PublicAuctionDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/auctions/edit/:auctionId"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <EditAuctionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/bids"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <MyBidsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/auctions/:auctionId/transaction"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <TransactionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/owner/auctions/:auctionId"
          element={
            <ProtectedRoute allowedRoles={['vehicle_owner']}>
              <AuctionDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <BuyerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer/auctions"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <BrowseAuctionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer/bids"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <MyBidsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer/auctions/:auctionId/transaction"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <TransactionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer/auctions/:auctionId"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <PublicAuctionDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer/profile"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer/workshops"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <BrowseWorkshopsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer/workshops/:id"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <PublicWorkshopDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/workshop"
          element={
            <ProtectedRoute allowedRoles={['workshop']}>
              <WorkshopDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/workshop/inventory"
          element={
            <ProtectedRoute allowedRoles={['workshop']}>
              <InventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/workshop/add-service"
          element={
            <ProtectedRoute allowedRoles={['workshop']}>
              <AddServicePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/workshop/services"
          element={
            <ProtectedRoute allowedRoles={['workshop']}>
              <ServicesOfferedPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/workshop/history"
          element={
            <ProtectedRoute allowedRoles={['workshop']}>
              <ServiceHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/workshop/profile"
          element={
            <ProtectedRoute allowedRoles={['workshop']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/workshop/appointments"
          element={
            <ProtectedRoute allowedRoles={['workshop']}>
              <WorkshopAppointmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;

