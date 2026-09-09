import React, { useEffect, useRef } from 'react';
import { getLanguageByCode } from '../config/languages';
import '../styles/translation.css';

function TranscriptPanel({ transcripts, partials, onClose, currentUserId }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, partials]);

  const fmtTime = (ts) =>
    ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="side-panel transcript-panel">
      <div className="panel-header">
        <h3>📝 Live Transcript</h3>
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="transcript-body">
        {transcripts.length === 0 && Object.keys(partials).length === 0 && (
          <p className="transcript-empty">
            Transcript will appear here when translation is ON and someone speaks...
          </p>
        )}

        {transcripts.map((t, i) => {
          const srcLang = getLanguageByCode(t.sourceLang);
          const tgtLang = getLanguageByCode(t.targetLang);
          const isMe = t.speakerId === currentUserId;

          return (
            <div key={t.utteranceId || i} className={`transcript-entry ${isMe ? 'mine' : 'theirs'}`}>
              <div className="transcript-meta">
                <span className={`speaker-dot ${isMe ? 'me' : 'other'}`} />
                <span className="speaker-name">{t.speakerName}{isMe ? ' (You)' : ''}</span>
                <span className="speaker-lang">{srcLang?.name || t.sourceLang}</span>
                <span className="transcript-time">{fmtTime(t.timestamp)}</span>
              </div>

              <div className="transcript-source">{t.sourceText}</div>

              {t.translatedText && (
                <div className="transcript-translation">
                  <span className="tl-label">{tgtLang?.nativeName || t.targetLang}:</span>
                  <span className="tl-text">{t.translatedText}</span>
                  {t.latency > 0 && (
                    <span className="tl-latency" title="Translation latency">{t.latency}ms</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Partial transcripts (currently speaking) */}
        {Object.entries(partials).map(([speakerId, partial]) => (
          <div key={`p-${speakerId}`} className="transcript-entry partial-entry">
            <div className="transcript-meta">
              <span className="speaker-dot partial" />
              <span className="speaker-name">{partial.speakerName}</span>
              <span className="partial-badge">speaking...</span>
            </div>
            <div className="transcript-source partial-text">{partial.sourceText}</div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default TranscriptPanel;