const express = require('express');
const router = express.Router();
const whatsappController = require('../../controllers/crm/whatsapp.controller');

// ── Publicly accessible for client portal (No Tele-caller auth token required) ────
router.get('/:shareId', whatsappController.getPublicSharedCatalogue);
router.post('/:shareId/open', whatsappController.trackShareOpen);
router.post('/:shareId/properties/:propertyId/video-view', whatsappController.trackVideoView);
router.post('/:shareId/properties/:propertyId/interest', whatsappController.trackPropertyInterest);
router.post('/:shareId/properties/:propertyId/reject', whatsappController.trackPropertyReject);

module.exports = router;
