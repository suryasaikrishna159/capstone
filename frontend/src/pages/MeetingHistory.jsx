import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { meetingApi } from '../services/api';
import Loading from '../components/Loading';
import '../styles/dashboard.css';

function MeetingHistory() {
  const { getToken, userId } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (userId) loadMeetings();
  }, [userId]);

  const loadMeetings = async () => {
    try {
      const data = await meetingApi.getUserMeetings(getToken, userId);
      setMeetings(data.meetings || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all' ? meetings : meetings.filter(m => m.status === filter);

  const formatDate = (d) => d ? new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const getDuration = (m) => {
    if (!m.startedAt || !m.endedAt) return m.status === 'active' ? 'In progress' : '—';
    const diff = new Date(m.endedAt) - new Date(m.startedAt);
    const mins = Math.floor(diff / 60000);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`;
  };

  if (loading) return <Loading message="Loading history..." />;

  return (
    <div className="page-container page-container-wide">
      <div className="history-header">
        <h1>Meeting History</h1>
        <p>Your past and ongoing meetings</p>
      </div>

      <div className="filter-tabs">
        {['all', 'active', 'ended', 'scheduled'].map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${meetings.length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <h3>No meetings found</h3>
          <p>{filter === 'all' ? 'Create or join a meeting to see it here.' : `No ${filter} meetings.`}</p>
          <button className="btn btn-primary" onClick={() => navigate('/create-meeting')}>
            Create Meeting
          </button>
        </div>
      ) : (
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Meeting ID</th>
                <th>Date</th>
                <th>Duration</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m._id}>
                  <td className="meeting-title-cell">
                    <div className="cell-icon">📹</div>
                    <div>
                      <div className="cell-title">{m.title}</div>
                      <div className="cell-sub">Host: {m.hostName}</div>
                    </div>
                  </td>
                  <td><code className="meeting-id-code">{m.meetingId}</code></td>
                  <td>{formatDate(m.createdAt)}</td>
                  <td>{getDuration(m)}</td>
                  <td>{m.participants?.length || 0}</td>
                  <td>
                    <span className={`status-badge ${m.status === 'active' ? 'status-active' : m.status === 'ended' ? 'status-ended' : 'status-scheduled'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>
                    {m.status !== 'ended' ? (
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/meeting/${m.meetingId}`)}>
                        Join
                      </button>
                    ) : (
                      <span className="text-muted">Ended</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default MeetingHistory;
