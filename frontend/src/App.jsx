import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { SignIn, SignUp } from '@clerk/clerk-react';

import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';

import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CreateMeeting from './pages/CreateMeeting';
import JoinMeeting from './pages/JoinMeeting';
import Meeting from './pages/Meeting';
import MeetingHistory from './pages/MeetingHistory';

function App() {
  return (
    <BrowserRouter>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="dark"
      />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/sign-in/*"
          element={
            <div className="auth-page">
              <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" afterSignInUrl="/dashboard" />
            </div>
          }
        />
        <Route
          path="/sign-up/*"
          element={
            <div className="auth-page">
              <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" afterSignUpUrl="/dashboard" />
            </div>
          }
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<><Navbar /><Dashboard /></>} />
          <Route path="/create-meeting" element={<><Navbar /><CreateMeeting /></>} />
          <Route path="/join" element={<><Navbar /><JoinMeeting /></>} />
          <Route path="/meeting/:meetingId" element={<Meeting />} />
          <Route path="/history" element={<><Navbar /><MeetingHistory /></>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
