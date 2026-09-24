const express = require('express');
const router = express.Router();
const callController = require('../../controllers/crm/call.controller');
const recordingController = require('../../controllers/crm/callRecording.controller');
const summaryController = require('../../controllers/crm/callSummary.controller');
const { uploadPropertyMedia } = require('../../middlewares/upload');

// ── Call Console Lifecycle ────────────────────────────────────────────────
router.post('/start', callController.startCall);
router.post('/:callId/end', callController.endCall);
router.get('/', callController.getAllCalls);
router.get('/:callId', callController.getCallById);
router.patch('/:callId', callController.updateCall);
router.patch('/:callId/outcome', callController.updateCallOutcome);

// ── Call Recording ────────────────────────────────────────────────────────
router.post('/:callId/recording', uploadPropertyMedia.single('recording'), recordingController.uploadCallRecording);
router.get('/:callId/recording', recordingController.getCallRecording);
router.get('/:callId/recording/details', recordingController.getCallRecordingDetails);
router.delete('/:callId/recording', recordingController.deleteCallRecording);

// ── AI Summary & Requirements Extraction ──────────────────────────────────
router.post('/:callId/summary', summaryController.generateCallSummary);
router.get('/:callId/summary', summaryController.getCallSummary);
router.post('/:callId/summary/regenerate', summaryController.regenerateCallSummary);
router.patch('/:callId/summary/requirements', summaryController.applySummaryToRequirements);

module.exports = router;
