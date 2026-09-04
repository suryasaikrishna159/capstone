import React, { useState, useEffect, useRef } from 'react';
import '../styles/components.css';

function ChatPanel({ messages, onSendMessage, currentUserId, onClose }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="panel chat-panel">
      <div className="panel-header">
        <h3>💬 Chat</h3>
        <button className="panel-close" onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet.</p>
            <p>Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.senderId === currentUserId;
            return (
              <div key={i} className={`chat-message ${isOwn ? 'own' : 'other'}`}>
                {!isOwn && <div className="msg-sender">{msg.senderName}</div>}
                <div className="msg-bubble">
                  <span className="msg-text">{msg.message}</span>
                </div>
                <div className="msg-time">{formatTime(msg.timestamp || msg.createdAt)}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSend}>
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          aria-label="Chat message input"
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!input.trim()}
          aria-label="Send message"
        >
          ➤
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
