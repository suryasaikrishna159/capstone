const express = require('express');
const router = express.Router();
const { getMessages, saveMessage } = require('../controllers/messageController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/:meetingId', getMessages);
router.post('/', saveMessage);

module.exports = router;
