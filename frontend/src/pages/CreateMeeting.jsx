import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { toast } from 'react-toastify';
import { meetingApi } from '../services/api';
import '../styles/dashboard.css';

function CreateMeeting() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);

  const hostName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Host';

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Please enter a meeting title'); return; }
    setLoading(true);
    try {
      const data = await meetingApi.create(getToken, { title: title.trim(), hostName });
      setCreated(data.meeting);
      toast.success('Meeting created successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to create meeting');
    } finally {
      setLoading(false);
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(created.meetingId);
    toast.success('Meeting ID copied to clipboard!');
  };

  return (
    <div className="page-container">
      <div className="form-card">
        <div className="form-card-header">
          <span className="form-card-icon">➕</span>
          <h1>Create Meeting</h1>
          <p>Set up a new meeting room for your team</p>
        </div>

        {!created ? (
          <form onSubmit={handleCreate} className="meeting-form">
            <div className="form-group">
              <label htmlFor="title">Meeting Title</label>
              <input
                id="title"
                type="text"
                className="form-input"
                placeholder="e.g., Weekly Team Standup"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                disabled={loading}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Creating...' : '🚀 Create Meeting'}
            </button>
            <button type="button" className="btn btn-ghost btn-full" onClick={() => navigate('/dashboard')}>
              Cancel
            </button>
          </form>
        ) : (
          <div className="meeting-created">
            <div className="success-icon">✅</div>
            <h2>Meeting Created!</h2>
            <p className="meeting-title-display">{created.title}</p>

            <div className="meeting-id-display">
              <label>Meeting ID</label>
              <div className="meeting-id-box">
                <span className="meeting-id-text">{created.meetingId}</span>
                <button className="btn btn-outline btn-sm" onClick={copyId} title="Copy Meeting ID">
                  📋 Copy
                </button>
              </div>
            </div>

            <p className="share-hint">Share this ID with participants so they can join.</p>

            <div className="created-actions">
              <button
                className="btn btn-primary btn-full"
                onClick={() => navigate(`/meeting/${created.meetingId}`)}
              >
                🎥 Start Meeting
              </button>
              <button
                className="btn btn-outline btn-full"
                onClick={() => navigate('/dashboard')}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateMeeting;
