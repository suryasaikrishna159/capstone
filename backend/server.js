require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./src/config/db');
const meetingRoutes = require('./src/routes/meetingRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const { initSocket } = require('./src/socket/socketHandler');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5174',
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

// API Routes
app.use('/api/meetings', meetingRoutes);
app.use('/api/messages', messageRoutes);

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
