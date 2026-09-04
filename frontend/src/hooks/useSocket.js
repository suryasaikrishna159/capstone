import { useEffect, useRef, useState } from 'react';
import { connectSocket, getSocket } from '../services/socket';

export function useSocket() {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketError, setSocketError] = useState(null);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    const onConnect = () => {
      setIsConnected(true);
      setSocketError(null);
    };

    const onDisconnect = (reason) => {
      setIsConnected(false);
      console.log('Socket disconnected:', reason);
    };

    const onConnectError = (err) => {
      setSocketError(err.message);
      console.error('Socket connection error:', err);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  return {
    socket: socketRef.current || getSocket(),
    isConnected,
    socketError
  };
}
