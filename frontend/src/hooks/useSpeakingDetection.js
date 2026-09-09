/**
 * useSpeakingDetection.js
 *
 * Uses AudioContext + AnalyserNode to detect when the local user is speaking.
 * Emits `isSpeaking` state changes which Meeting.jsx relays via socket.
 */
import { useEffect, useRef, useState } from 'react';

export function useSpeakingDetection({ stream, enabled }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const rafRef    = useRef(null);
  const ctxRef    = useRef(null);
  const stateRef  = useRef(false);

  useEffect(() => {
    if (!stream || !enabled) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (ctxRef.current) { ctxRef.current.close(); ctxRef.current = null; }
      setIsSpeaking(false);
      stateRef.current = false;
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let ctx, analyser, source, data;
    try {
      ctx      = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize             = 256;
      analyser.smoothingTimeConstant = 0.4;
      source   = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      data     = new Uint8Array(analyser.frequencyBinCount);
      ctxRef.current = ctx;
    } catch (e) {
      console.warn('[SpeakingDetection] AudioContext error:', e.message);
      return;
    }

    const THRESHOLD    = 12;
    const SPEAK_FRAMES = 4;
    const SILENT_FRAMES = 25;
    let speakF = 0, silentF = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;

      if (avg > THRESHOLD) {
        speakF++;
        silentF = 0;
        if (speakF >= SPEAK_FRAMES && !stateRef.current) {
          stateRef.current = true;
          setIsSpeaking(true);
        }
      } else {
        silentF++;
        speakF = 0;
        if (silentF >= SILENT_FRAMES && stateRef.current) {
          stateRef.current = false;
          setIsSpeaking(false);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      try { source.disconnect(); } catch (_) {}
      try { ctx.close(); } catch (_) {}
      ctxRef.current = null;
      stateRef.current = false;
      setIsSpeaking(false);
    };
  }, [stream, enabled]);

  return { isSpeaking };
}