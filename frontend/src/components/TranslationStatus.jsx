import React from 'react';

export function TranslationStatus({ isListening, isSpeaking, spokenLang, listeningLang, sttSupported }) {
  if (!spokenLang) return null;

  let icon = '🌐', text = 'Ready', cls = 'idle';
  if (!sttSupported) { icon = '⚠️'; text = 'STT not supported in this browser'; cls = 'warn'; }
  else if (isSpeaking) { icon = '🔊'; text = 'Playing translation...'; cls = 'playing'; }
  else if (isListening) { icon = '🎙️'; text = 'Listening...'; cls = 'listening'; }

  return (
    <div className={`translation-status-bar ${cls}`}>
      <span className="ts-icon">{icon}</span>
      <span className="ts-text">{text}</span>
      {spokenLang && listeningLang && (
        <span className="ts-pair">
          {spokenLang.toUpperCase()} → {listeningLang.toUpperCase()}
        </span>
      )}
    </div>
  );
}