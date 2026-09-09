import React from 'react';
import { LANGUAGES } from '../config/languages';
import '../styles/translation.css';

function TranslationPanel({
  isOpen, onClose,
  spokenLang, listeningLang,
  translationEnabled, ttsEnabled, originalAudioEnabled, transcriptVisible,
  onSpokenLangChange, onListeningLangChange,
  onTranslationToggle, onTtsToggle, onOriginalAudioToggle, onTranscriptToggle,
}) {
  if (!isOpen) return null;

  return (
    <div className="side-panel translation-panel">
      <div className="panel-header">
        <h3>🌐 Language Settings</h3>
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="panel-body">
        {/* Master toggle */}
        <div className="setting-row main-toggle">
          <span className="setting-label">Translation</span>
          <button
            className={`toggle-btn ${translationEnabled ? 'on' : 'off'}`}
            onClick={onTranslationToggle}
            aria-pressed={translationEnabled}
          >
            {translationEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {translationEnabled && (
          <>
            <div className="lang-divider" />

            <div className="setting-row">
              <label className="setting-label" htmlFor="spoken-lang">I speak:</label>
              <select
                id="spoken-lang"
                className="lang-select"
                value={spokenLang}
                onChange={e => onSpokenLangChange(e.target.value)}
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>
                    {l.name} — {l.nativeName}
                  </option>
                ))}
              </select>
            </div>

            <div className="setting-row">
              <label className="setting-label" htmlFor="listening-lang">I want to hear:</label>
              <select
                id="listening-lang"
                className="lang-select"
                value={listeningLang}
                onChange={e => onListeningLangChange(e.target.value)}
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>
                    {l.name} — {l.nativeName}
                  </option>
                ))}
              </select>
            </div>

            <div className="lang-divider" />

            <div className="setting-row">
              <span className="setting-label">
                🔊 Translated audio
                <small className="setting-hint">Hear AI-translated speech</small>
              </span>
              <button
                className={`toggle-btn-sm ${ttsEnabled ? 'on' : 'off'}`}
                onClick={onTtsToggle}
                aria-pressed={ttsEnabled}
              >{ttsEnabled ? 'ON' : 'OFF'}</button>
            </div>

            <div className="setting-row">
              <span className="setting-label">
                🎙️ Original audio
                <small className="setting-hint">Hear original WebRTC speech</small>
              </span>
              <button
                className={`toggle-btn-sm ${originalAudioEnabled ? 'on' : 'off'}`}
                onClick={onOriginalAudioToggle}
                aria-pressed={originalAudioEnabled}
              >{originalAudioEnabled ? 'ON' : 'OFF'}</button>
            </div>

            <div className="setting-row">
              <span className="setting-label">
                📝 Show transcript
                <small className="setting-hint">Live captions panel</small>
              </span>
              <button
                className={`toggle-btn-sm ${transcriptVisible ? 'on' : 'off'}`}
                onClick={onTranscriptToggle}
                aria-pressed={transcriptVisible}
              >{transcriptVisible ? 'ON' : 'OFF'}</button>
            </div>

            <div className="lang-divider" />
            <p className="translation-note">
              💡 Speech recognition works best in <strong>Chrome</strong> or <strong>Edge</strong>.
              Speak clearly and allow microphone access.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default TranslationPanel;