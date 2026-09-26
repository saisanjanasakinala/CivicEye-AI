import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BusCamera from './pages/BusCamera'
import CityMapPage from './pages/CityMapPage'
import ComplaintsPage from './pages/ComplaintsPage'
import ComplaintDetail from './pages/ComplaintDetail'
import GovernmentDashboard from './pages/GovernmentDashboard'
import AnalyticsPage from './pages/AnalyticsPage'
import CitizenPortal from './pages/CitizenPortal'
import NotificationsPage from './pages/NotificationsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/bus-camera"
              element={
                <ProtectedRoute>
                  <BusCamera />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/map"
              element={
                <ProtectedRoute>
                  <CityMapPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/complaints"
              element={
                <ProtectedRoute>
                  <ComplaintsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/complaints/:id"
              element={
                <ProtectedRoute>
                  <ComplaintDetail />
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
                <ProtectedRoute>
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/citizen"
              element={
                <ProtectedRoute>
                  <CitizenPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/notifications"
              element={
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
