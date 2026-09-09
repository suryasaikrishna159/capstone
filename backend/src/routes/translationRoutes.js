const express = require('express');
const router = express.Router();
const { translate, getLanguages, getMeetingTranscript } = require('../controllers/translationController');

router.post('/translate', translate);
router.get('/languages', getLanguages);
router.get('/transcript/:meetingId', getMeetingTranscript);

module.exports = router;