/**
 * useSpeechRecognition.js
 *
 * Wraps the browser Web Speech API (SpeechRecognition).
 * Works in Chrome and Edge. Not supported in Firefox/Safari.
 *
 * Props:
 *   enabled       — translation is ON and user wants STT
 *   speechCode    — BCP-47 language code e.g. "te-IN"
 *   isMuted       — pause recognition when mic is muted
 *   isTTSPlaying  — pause recognition while TTS is playing (anti-feedback)
 *   onPartial     — called with interim transcript text
 *   onFinal       — called with final transcript text
 */
import { useEffect, useRef, useState } from 'react';

export function useSpeechRecognition({
  enabled,
  speechCode,
  isMuted,
  isTTSPlaying,
  onPartial,
  onFinal,
}) {
  const [isListening, setIsListening]   = useState(false);
  const [isSupported, setIsSupported]   = useState(false);
  const [error, setError]               = useState(null);

  const recognitionRef = useRef(null);
  const onPartialRef   = useRef(onPartial);
  const onFinalRef     = useRef(onFinal);
  const restartRef     = useRef(null);
  const silenceTimerRef = useRef(null);
  const currentInterimRef = useRef('');
  const lastCommittedRef  = useRef('');

  // Keep callback refs stable
  useEffect(() => { onPartialRef.current = onPartial; }, [onPartial]);
  useEffect(() => { onFinalRef.current   = onFinal;   }, [onFinal]);

  const commitFinal = (text) => {
    const clean = (text || currentInterimRef.current || '').trim();
    if (!clean) return;
    if (clean === lastCommittedRef.current) return;
    lastCommittedRef.current = clean;
    currentInterimRef.current = '';
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    console.log('[STT] Committing final text:', clean);
    onFinalRef.current?.(clean);
  };

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SR);
    if (!SR) return;

    const shouldRun = enabled && !isMuted && !isTTSPlaying;

    if (!shouldRun) {
      if (currentInterimRef.current) {
        commitFinal();
      }
      // Stop any running instance
      if (recognitionRef.current) {
        recognitionRef.current._stopping = true;
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
      if (restartRef.current) { clearTimeout(restartRef.current); restartRef.current = null; }
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      setIsListening(false);
      return;
    }

    // Create fresh instance
    const recognition = new SR();
    recognition.lang              = speechCode || 'en-US';
    recognition.continuous        = true;
    recognition.interimResults    = true;
    recognition.maxAlternatives   = 1;
    recognition._stopping         = false;
    recognitionRef.current        = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const item = e.results[i];
        if (item && item[0]) {
          const t = item[0].transcript;
          if (item.isFinal) {
            final += t;
          } else {
            interim += t;
          }
        }
      }

      if (final.trim()) {
        commitFinal(final.trim());
      } else if (interim.trim()) {
        currentInterimRef.current = interim.trim();
        onPartialRef.current?.(interim.trim());

        // Reset silence timer: if speaker pauses for 1000ms, finalize the speech
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          commitFinal();
        }, 1000);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        setError('Microphone permission denied for speech recognition');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[STT] Error:', e.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Flush any lingering interim text
      if (currentInterimRef.current) {
        commitFinal();
      }

      // Auto-restart unless we intentionally stopped
      if (!recognition._stopping && enabled && !isMuted && !isTTSPlaying) {
        restartRef.current = setTimeout(() => {
          if (!recognition._stopping) {
            try { recognition.start(); } catch (_) {}
          }
        }, 300);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      setError('Failed to start speech recognition: ' + err.message);
    }

    return () => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (restartRef.current) { clearTimeout(restartRef.current); restartRef.current = null; }
      if (recognitionRef.current) {
        recognitionRef.current._stopping = true;
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
    };
  }, [enabled, speechCode, isMuted, isTTSPlaying]);

  return { isListening, isSupported, error };
}