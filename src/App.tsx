import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import ErrorBoundary from './components/UI/ErrorBoundary'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BusCamera from './pages/BusCamera'
import BusFleetPage from './pages/BusFleetPage'
import BusDetailPage from './pages/BusDetailPage'
import CityMapPage from './pages/CityMapPage'
import ComplaintsPage from './pages/ComplaintsPage'
import ComplaintDetail from './pages/ComplaintDetail'
import GovernmentDashboard from './pages/GovernmentDashboard'
import AnalyticsPage from './pages/AnalyticsPage'
import CitizenHome from './pages/CitizenHome'
import NotificationsPage from './pages/NotificationsPage'
import SettingsPage from './pages/SettingsPage'
import RoadHealthPage from './pages/RoadHealthPage'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <Routes>
              {/* Municipal Smart-City Homepage (Two main actions: Government Staff Login & Citizen Portal) */}
              <Route path="/" element={<Landing />} />

              {/* Public Citizen Portal (No credentials required: Submit Complaint & Track Complaint) */}
              <Route path="/citizen" element={<CitizenHome />} />
              <Route path="/dashboard/citizen" element={<Navigate to="/citizen" replace />} />

              {/* Staff Authentication */}
              <Route path="/login" element={<Login />} />
              <Route path="/admin/login" element={<Login />} />

              {/* Protected Government Command Center */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/buses"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <BusFleetPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/buses/:id"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <BusDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/bus-camera"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <BusCamera />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/complaints"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <ComplaintsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/complaints/:id"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <ComplaintDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/road-health"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <RoadHealthPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/map"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <CityMapPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/government"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <GovernmentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/analytics"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <AnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/settings"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/notifications"
                element={
                  <ProtectedRoute roles={['admin', 'officer']}>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
