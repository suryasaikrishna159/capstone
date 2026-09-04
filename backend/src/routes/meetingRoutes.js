const express = require('express');
const router = express.Router();
const {
  createMeeting,
  getMeeting,
  joinMeeting,
  leaveMeeting,
  endMeeting,
  getUserMeetings
} = require('../controllers/meetingController');
const { requireAuth } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(requireAuth);

router.post('/', createMeeting);
router.get('/user/:userId', getUserMeetings);
router.get('/:meetingId', getMeeting);
router.post('/:meetingId/join', joinMeeting);
router.post('/:meetingId/leave', leaveMeeting);
router.post('/:meetingId/end', endMeeting);

module.exports = router;
