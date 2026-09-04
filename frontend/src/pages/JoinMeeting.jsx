import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'react-toastify';
import { meetingApi } from '../services/api';
import '../styles/dashboard.css';

function JoinMeeting() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [meetingId, setMeetingId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e) => {
    e.preventDefault();
    const id = meetingId.trim().toUpperCase();
    if (!id) { toast.error('Please enter a meeting ID'); return; }

    const pattern = /^[A-Z]{3}-\d{3}-[A-Z]{3}$/;
    if (!pattern.test(id)) {
      toast.error('Invalid meeting ID format. Expected: ABC-123-XYZ');
      return;
    }

    setLoading(true);
    try {
      await meetingApi.get(getToken, id);
      navigate(`/meeting/${id}`);
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('not found')) {
        toast.error('Meeting not found. Check the ID and try again.');
      } else if (err.message.includes('ended')) {
        toast.error('This meeting has already ended.');
      } else {
        toast.error(err.message || 'Failed to join meeting');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setMeetingId(val);
  };

  return (
    <div className="page-container">
      <div className="form-card">
        <div className="form-card-header">
          <span className="form-card-icon">🔗</span>
          <h1>Join Meeting</h1>
          <p>Enter the meeting ID shared by your host</p>
        </div>

        <form onSubmit={handleJoin} className="meeting-form">
          <div className="form-group">
            <label htmlFor="meetingId">Meeting ID</label>
            <input
              id="meetingId"
              type="text"
              className="form-input meeting-id-input"
              placeholder="ABC-123-XYZ"
              value={meetingId}
              onChange={handleInput}
              maxLength={11}
              disabled={loading}
              autoFocus
              autoComplete="off"
            />
            <span className="form-hint">Format: 3 letters – 3 numbers – 3 letters</span>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading || meetingId.length < 11}>
            {loading ? 'Checking...' : '🔗 Join Meeting'}
          </button>
          <button type="button" className="btn btn-ghost btn-full" onClick={() => navigate('/dashboard')}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default JoinMeeting;
