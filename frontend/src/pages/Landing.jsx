import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

function Landing() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  const features = [
    { icon: '🎥', title: 'HD Video Calls', desc: 'Crystal clear video with adaptive quality based on your connection.' },
    { icon: '🔒', title: 'Secure Meetings', desc: 'End-to-end WebRTC encryption. Your conversations stay private.' },
    { icon: '💬', title: 'Real-time Chat', desc: 'Send messages during meetings. Chat history saved automatically.' },
    { icon: '🖥️', title: 'Screen Sharing', desc: 'Share your screen with a single click. Present anything.' },
    { icon: '👥', title: 'Multi-user Rooms', desc: 'Invite multiple participants. See who is speaking in real time.' },
    { icon: '🎙️', title: 'Host Controls', desc: 'Hosts can manage participants, mute controls, and end meetings.' },
  ];

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-logo">
          <span className="brand-icon">📡</span>
          MeetSpace
        </div>
        <div className="landing-nav-actions">
          {isSignedIn ? (
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          ) : (
            <>
              <Link to="/sign-in" className="btn btn-outline">Sign In</Link>
              <Link to="/sign-up" className="btn btn-primary">Get Started</Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">✨ Free &amp; Open Platform</div>
          <h1 className="hero-title">
            Simple, secure<br />
            <span className="gradient-text">real-time video meetings</span>
          </h1>
          <p className="hero-subtitle">
            Connect with anyone, anywhere. No downloads required.
            Just create a meeting, share the ID, and start collaborating.
          </p>
          <div className="hero-actions">
            {isSignedIn ? (
              <>
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/create-meeting')}>
                  Start a Meeting
                </button>
                <button className="btn btn-outline btn-lg" onClick={() => navigate('/join')}>
                  Join with ID
                </button>
              </>
            ) : (
              <>
                <Link to="/sign-up" className="btn btn-primary btn-lg">Get Started Free</Link>
                <Link to="/sign-in" className="btn btn-outline btn-lg">Sign In</Link>
              </>
            )}
          </div>
          <p className="hero-note">No credit card required · Works in your browser</p>
        </div>
        <div className="hero-visual">
          <div className="meeting-preview">
            <div className="preview-header">
              <span className="preview-dot red" />
              <span className="preview-dot yellow" />
              <span className="preview-dot green" />
              <span className="preview-title">MeetSpace — ABC-123-XYZ</span>
            </div>
            <div className="preview-grid">
              {['S', 'R', 'P', 'A'].map((initial, i) => (
                <div key={i} className="preview-tile">
                  <div className="preview-avatar">{initial}</div>
                  <div className="preview-name">{['Surya', 'Rahul', 'Priya', 'Arjun'][i]}</div>
                  <div className="preview-icons">
                    <span>{i === 1 ? '🔇' : '🎙️'}</span>
                    <span>{i === 3 ? '📵' : '📹'}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="preview-controls">
              <span className="preview-btn active">🎙️</span>
              <span className="preview-btn active">📹</span>
              <span className="preview-btn">🖥️</span>
              <span className="preview-btn">💬</span>
              <span className="preview-btn leave">Leave</span>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <h2 className="section-title">Everything you need for productive meetings</h2>
        <div className="features-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta">
        <h2>Ready to connect?</h2>
        <p>Join thousands of teams already using MeetSpace.</p>
        <Link to="/sign-up" className="btn btn-primary btn-lg">Create Free Account</Link>
      </section>

      <footer className="landing-footer">
        <p>© 2026 MeetSpace · Built with React, Node.js & WebRTC</p>
      </footer>
    </div>
  );
}

export default Landing;
