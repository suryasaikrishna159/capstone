import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { toast } from 'react-toastify';
import { meetingApi } from '../services/api';
import Loading from '../components/Loading';
import '../styles/dashboard.css';

function Dashboard() {
  const { user } = useUser();
  const { getToken, userId } = useAuth();
  const navigate = useNavigate();
  const [recentMeetings, setRecentMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const displayName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User';

  useEffect(() => {
    if (userId) loadRecentMeetings();
  }, [userId]);

  const loadRecentMeetings = async () => {
    try {
      const data = await meetingApi.getUserMeetings(getToken, userId);
      setRecentMeetings((data.meetings || []).slice(0, 5));
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const map = { active: 'status-active', ended: 'status-ended', scheduled: 'status-scheduled' };
    return map[status] || 'status-scheduled';
  };

  if (loading) return <Loading message="Loading dashboard..." />;

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-greeting">Welcome back, {displayName}! 👋</h1>
            <p className="dashboard-subtitle">What would you like to do today?</p>
          </div>
        </div>

        <div className="quick-actions">
          <button className="action-card action-new" onClick={() => navigate('/create-meeting')}>
            <div className="action-icon">➕</div>
            <div className="action-text">
              <h3>New Meeting</h3>
              <p>Start an instant meeting</p>
            </div>
          </button>
          <button className="action-card action-join" onClick={() => navigate('/join')}>
            <div className="action-icon">🔗</div>
            <div className="action-text">
              <h3>Join Meeting</h3>
              <p>Enter a meeting ID</p>
            </div>
          </button>
          <button className="action-card action-history" onClick={() => navigate('/history')}>
            <div className="action-icon">📋</div>
            <div className="action-text">
              <h3>Meeting History</h3>
              <p>View past meetings</p>
            </div>
          </button>
        </div>

        <div className="recent-meetings-section">
          <div className="section-header">
            <h2>Recent Meetings</h2>
            {recentMeetings.length > 0 && (
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/history')}>
                View All
              </button>
            )}
          </div>

          {recentMeetings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <h3>No meetings yet</h3>
              <p>Create or join a meeting to get started.</p>
              <button className="btn btn-primary" onClick={() => navigate('/create-meeting')}>
                Start First Meeting
              </button>
            </div>
          ) : (
            <div className="meetings-list">
              {recentMeetings.map((m) => (
                <div key={m._id} className="meeting-item">
                  <div className="meeting-item-left">
                    <div className="meeting-item-icon">📹</div>
                    <div className="meeting-item-info">
                      <h4>{m.title}</h4>
                      <div className="meeting-item-meta">
                        <span>ID: {m.meetingId}</span>
                        <span>·</span>
                        <span>{formatDate(m.createdAt)}</span>
                        <span>·</span>
                        <span>{m.participants?.length || 0} participant{m.participants?.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="meeting-item-right">
                    <span className={`status-badge ${getStatusBadge(m.status)}`}>
                      {m.status}
                    </span>
                    {m.status !== 'ended' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/meeting/${m.meetingId}`)}
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
