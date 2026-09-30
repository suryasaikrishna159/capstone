require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./src/config/db');
const meetingRoutes = require('./src/routes/meetingRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const translationRoutes = require('./src/routes/translationRoutes');
const { initSocket } = require('./src/socket/socketHandler');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// CORS configuration — allow Netlify frontend + local dev
const ALLOWED_ORIGINS = [
  'https://meet-space-capstone.netlify.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://footwear-tightly-gauze.ngrok-free.dev',
];
if (process.env.CLIENT_URL && !ALLOWED_ORIGINS.includes(process.env.CLIENT_URL)) {
  ALLOWED_ORIGINS.push(process.env.CLIENT_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., Render health checks, curl)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('[CORS] Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Socket.IO setup
const io = new Server(server, {
  cors: corsOptions
});

// Initialize socket handler
initSocket(io);

const iceServersRoute = require('./src/routes/iceServersRoute');

// API Routes
app.use('/api/meetings', meetingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/translation', translationRoutes);
app.use('/api/ice-servers', iceServersRoute);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MeetSpace API is running' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`MeetSpace server running on port ${PORT}`);
});
