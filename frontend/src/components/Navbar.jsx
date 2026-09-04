import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import '../styles/components.css';

function Navbar() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const displayName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User';

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <Link to="/dashboard" className="navbar-brand">
        <span className="brand-icon">📡</span>
        MeetSpace
      </Link>

      <div className="navbar-links">
        <Link to="/dashboard" className="nav-link">Dashboard</Link>
        <Link to="/history" className="nav-link">History</Link>
      </div>

      <div className="navbar-user">
        <div className="user-avatar" title={displayName}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span className="user-name">{displayName}</span>
        <button onClick={handleSignOut} className="btn btn-outline btn-sm" aria-label="Sign out">
          Sign Out
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
