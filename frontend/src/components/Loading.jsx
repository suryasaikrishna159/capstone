import React from 'react';
import '../styles/components.css';

function Loading({ message = 'Loading...' }) {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" aria-label="Loading" />
      <p className="loading-text">{message}</p>
    </div>
  );
}

export default Loading;
