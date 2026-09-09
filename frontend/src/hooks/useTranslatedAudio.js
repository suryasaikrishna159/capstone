/**
 * useTranslatedAudio.js
 *
 * Manages a queue of translated speech segments and plays them
 * sequentially using the browser speechSynthesis API.
 *
 * Anti-feedback: sets isSpeaking=true while TTS is playing,
 * which the parent passes to useSpeechRecognition to pause STT.
 */
import { useRef, useState, useCallback, useEffect } from 'react';

export function useTranslatedAudio({ enabled }) {
  const queueRef       = useRef([]);
  const isPlayingRef   = useRef(false);
  const enabledRef     = useRef(enabled);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // Cancel all TTS if disabled
  useEffect(() => {
    if (!enabled) {
      window.speechSynthesis?.cancel();
      queueRef.current = [];
      isPlayingRef.current = false;
      setIsSpeaking(false);
    }
  }, [enabled]);

  const activeUtteranceRef = useRef(null);

  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    if (!enabledRef.current) { queueRef.current = []; return; }
    if (queueRef.current.length === 0) return;

    const { text, lang } = queueRef.current.shift();
    if (!text || !text.trim()) { playNext(); return; }

    if (!window.speechSynthesis) return;

    // Some browsers need synth to be unpaused first
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang   = lang || 'en-US';
    utterance.rate   = 1.0;
    utterance.volume = 1.0;

    // Pick best matching voice if available
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const prefix = (lang || '').split('-')[0].toLowerCase();
        const matched = voices.find(v => v.lang === lang) ||
                        voices.find(v => v.lang.toLowerCase().startsWith(prefix));
        if (matched) utterance.voice = matched;
      }
    } catch (_) {}

    // Store reference to prevent Chrome GC bug during playback
    activeUtteranceRef.current = utterance;

    utterance.onstart = () => {
      isPlayingRef.current = true;
      setIsSpeaking(true);
    };
    const done = () => {
      activeUtteranceRef.current = null;
      isPlayingRef.current = false;
      setIsSpeaking(false);
      setTimeout(playNext, 120);
    };
    utterance.onend   = done;
    utterance.onerror = (e) => {
      console.warn('[TTS] Error:', e.error);
      done();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('[TTS] speak failed:', err);
      done();
    }
  }, []);

  const enqueue = useCallback((text, lang) => {
    if (!enabledRef.current || !text?.trim()) return;
    queueRef.current.push({ text, lang });
    playNext();
  }, [playNext]);

  const clear = useCallback(() => {
    window.speechSynthesis?.cancel();
    queueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  return { enqueue, clear, isSpeaking };
}