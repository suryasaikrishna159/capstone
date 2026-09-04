# MeetSpace — MERN Video Meeting Platform

A production-ready real-time video conferencing platform built with the MERN stack, WebRTC, Socket.IO, and Clerk authentication. Similar in concept to a simplified Zoom/Google Meet.

---

## Features

- 🎥 **Real-time WebRTC video & audio** — native peer-to-peer, no SDK
- 🔒 **Clerk authentication** — sign up, sign in, sign out, protected routes
- 🆔 **Unique meeting IDs** — format `ABC-123-XYZ`, shareable
- 💬 **Real-time chat** — Socket.IO broadcast + MongoDB persistence
- 🖥️ **Screen sharing** — native `getDisplayMedia`, replaces video track
- 👥 **Multi-user mesh WebRTC** — up to ~5 users simultaneously
- 🎙️ **Mute/unmute microphone** — track-level control, broadcast to peers
- 📹 **Camera on/off** — track-level control, broadcast to peers
- 📋 **Participant panel** — live list with host/mute/camera status
- ⭐ **Host controls** — remove participant, end meeting for everyone
- 📅 **Meeting history** — per-user, stored in MongoDB
- 📱 **Responsive** — works on desktop, tablet, and mobile

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, JavaScript |
| Routing | React Router DOM v6 |
| Auth | Clerk (@clerk/clerk-react) |
| Real-time | Socket.IO Client |
| Video/Audio | Native WebRTC APIs |
| Notifications | React Toastify |
| Backend | Node.js, Express.js |
| Database | MongoDB (Mongoose) |
| Signaling | Socket.IO Server |
| Auth Backend | @clerk/backend |

---

## Architecture

```
Browser A                    Express Server                Browser B
  |                               |                            |
  |-- join-room ----------------->|<-- join-room --------------|
  |<-- existing-users ------------|-- user-joined ------------>|
  |                               |                            |
  |-- offer (via server) -------->|-- offer ------------------>|
  |<-- answer (via server) -------|<-- answer -----------------|
  |-- ice-candidate (relay) ----->|-- ice-candidate (relay) -->|
  |                               |                            |
  |<========= WebRTC P2P ===============================>|
        (STUN: stun.l.google.com:19302)
```

**Mesh architecture**: every participant creates a direct RTCPeerConnection to every other participant. The Socket.IO server only relays signaling messages (offer/answer/ICE candidates). Media traffic flows directly peer-to-peer.

---

## Folder Structure

```
capstone/
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── Loading.jsx
│   │   │   ├── VideoGrid.jsx
│   │   │   ├── VideoTile.jsx
│   │   │   ├── MeetingControls.jsx
│   │   │   ├── ChatPanel.jsx
│   │   │   └── ParticipantList.jsx
│   │   ├── pages/              # Route pages
│   │   │   ├── Landing.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── CreateMeeting.jsx
│   │   │   ├── JoinMeeting.jsx
│   │   │   ├── Meeting.jsx      # Main meeting room (WebRTC orchestration)
│   │   │   └── MeetingHistory.jsx
│   │   ├── hooks/
│   │   │   ├── useWebRTC.js     # All WebRTC peer connection logic
│   │   │   └── useSocket.js     # Socket.IO connection
│   │   ├── services/
│   │   │   ├── api.js           # REST API client
│   │   │   └── socket.js        # Socket.IO singleton
│   │   └── styles/             # CSS files
│   ├── .env
│   └── package.json
└── backend/
    ├── server.js
    ├── src/
    │   ├── config/db.js
    │   ├── models/
    │   │   ├── Meeting.js
    │   │   └── Message.js
    │   ├── controllers/
    │   │   ├── meetingController.js
    │   │   └── messageController.js
    │   ├── routes/
    │   │   ├── meetingRoutes.js
    │   │   └── messageRoutes.js
    │   ├── middleware/authMiddleware.js
    │   ├── socket/socketHandler.js      # WebRTC signaling + chat
    │   └── utils/generateMeetingId.js
    ├── .env
    └── package.json
```

---

## Environment Variables

### Frontend (`frontend/.env`)

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### Backend (`backend/.env`)

```env
PORT=5000
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/meetspace
CLERK_SECRET_KEY=sk_test_...
CLIENT_URL=http://localhost:5173
```

> ⚠️ **CLERK_SECRET_KEY**: Get this from your Clerk dashboard → API Keys → Secret Keys.

---

## Installation & Running Locally

### Prerequisites

- Node.js v18+
- MongoDB Atlas account (or local MongoDB)
- Clerk account (free tier works)

### 1. Clone and setup

```bash
git clone <repo-url>
cd capstone
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in MONGO_URI and CLERK_SECRET_KEY in .env
npm install
npm run dev
# Backend starts on http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# Fill in VITE_CLERK_PUBLISHABLE_KEY in .env
npm install
npm run dev
# Frontend starts on http://localhost:5173
```

---

## Clerk Setup

1. Go to [clerk.com](https://clerk.com) and create a free account
2. Create a new application
3. From **API Keys**: copy the **Publishable Key** → `VITE_CLERK_PUBLISHABLE_KEY`
4. From **API Keys**: copy the **Secret Key** → `CLERK_SECRET_KEY` (backend)
5. In Clerk Dashboard → **Paths**: set sign-in path to `/sign-in`, sign-up to `/sign-up`

---

## Testing Two Users

1. Open **Browser A** → `http://localhost:5173`
2. Sign in as User A
3. Click **New Meeting** → enter title → **Create Meeting** → **Start Meeting**
4. Copy the meeting ID (e.g., `ABC-123-XYZ`)
5. Open **Browser B** (incognito or different browser) → `http://localhost:5173`
6. Sign in as User B
7. Click **Join Meeting** → enter the meeting ID → **Join**
8. Both browsers should show each other's video/audio

Then test:
- 🎙️ Mute → other browser sees 🔇
- 📵 Camera off → other browser sees grey tile
- 🖥️ Screen share → other browser sees shared screen
- 💬 Chat → messages appear in both browsers
- 👥 Participants panel → lists both users
- ❌ Leave → other browser sees participant removed

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/meetings` | Create meeting |
| GET | `/api/meetings/:meetingId` | Get meeting info |
| POST | `/api/meetings/:meetingId/join` | Register participant join |
| POST | `/api/meetings/:meetingId/leave` | Register participant leave |
| POST | `/api/meetings/:meetingId/end` | Host ends meeting |
| GET | `/api/meetings/user/:userId` | Get user meeting history |
| GET | `/api/messages/:meetingId` | Get meeting chat messages |
| POST | `/api/messages` | Save a chat message |

All endpoints require `Authorization: Bearer <clerk-token>` header.

---

## WebRTC Explanation

WebRTC (Web Real-Time Communication) enables peer-to-peer media streaming directly between browsers without routing through a server.

**Connection flow:**
1. Both peers gather ICE candidates (network paths)
2. One peer creates an **offer** (SDP) describing its capabilities
3. The other peer sends an **answer** (SDP)
4. ICE candidates are exchanged until a route is found (via STUN)
5. Media streams flow directly between peers

**STUN servers** (Google's public): help peers discover their public IP address and port. Sufficient for most networks.

**TURN servers** (not included): required when STUN fails (strict firewalls, symmetric NAT). Easy to add in `ICE_SERVERS` config in `useWebRTC.js`.

---

## Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `join-room` | client → server | Join a meeting room |
| `existing-users` | server → client | List of users already in room |
| `user-joined` | server → clients | New user joined |
| `offer` | client ↔ server ↔ client | WebRTC offer relay |
| `answer` | client ↔ server ↔ client | WebRTC answer relay |
| `ice-candidate` | client ↔ server ↔ client | ICE candidate relay |
| `user-left` | server → clients | User disconnected |
| `mute-status` | client → server → clients | Mic state change |
| `camera-status` | client → server → clients | Camera state change |
| `screen-share-started` | client → server → clients | Screen sharing began |
| `screen-share-stopped` | client → server → clients | Screen sharing ended |
| `chat-message` | client → server → clients | Chat message |
| `participant-update` | server → clients | Full participant list refresh |
| `remove-participant` | host → server | Remove a participant |
| `end-meeting` | host → server → clients | Host ends meeting |
| `meeting-ended` | server → clients | Meeting closed |
| `removed-from-meeting` | server → client | You were removed |

---

## Future: Multilingual Translation Architecture

Version 2 does **not** implement translation. However, the architecture is designed for it:

```
User A microphone
  ↓ (localStream in useWebRTC.js)
Speech Recognition API (future: Web Speech API / Whisper)
  ↓
Translation API (future: Google Translate / DeepL)
  ↓
Text-to-Speech (future: Web Speech API / TTS service)
  ↓
Translated audio stream
  ↓
replaceTrack() into RTCPeerConnection senders
  ↓
User B receives translated audio
```

Extension point: `localStream` and `remoteStreams` are exposed from `useWebRTC.js`. A future `useTranslation.js` hook can intercept tracks without modifying the core WebRTC pipeline.

---

## Known Limitations

- **Mesh WebRTC**: Works well for 2-5 users. For 10+ users, an SFU (mediasoup, LiveKit, Janus) would be needed. Architecture is designed to allow swapping.
- **STUN only**: May not work on very restrictive corporate networks. Add TURN servers for production.
- **No E2E encryption**: WebRTC provides DTLS/SRTP encryption in transit, but no end-to-end encryption for the signaling layer.
- **Single tab only**: The Socket.IO singleton doesn't support multiple tabs of the same meeting.

---

## Deployment

### Backend (e.g., Railway, Render, Heroku)
```bash
# Set env vars on the platform
npm start
```

### Frontend (e.g., Vercel, Netlify)
```bash
npm run build
# Deploy dist/ folder
# Set VITE_API_URL and VITE_SOCKET_URL to production backend URL
```

Update `CLIENT_URL` in backend `.env` to the deployed frontend URL.
