const express = require('express');
const router = express.Router();
const showcaseController = require('../../controllers/crm/showcase.controller');

router.post('/', showcaseController.createShowcase);
router.get('/:showcaseId', showcaseController.getShowcaseById);
router.patch('/:showcaseId', showcaseController.updateShowcase);
router.post('/:showcaseId/properties/:propertyId', showcaseController.addPropertyToShowcase);
router.delete('/:showcaseId/properties/:propertyId', showcaseController.removePropertyFromShowcase);
router.patch('/:showcaseId/properties/order', showcaseController.reorderShowcaseProperties);
router.patch('/:showcaseId/activate', showcaseController.activateShowcase);
router.patch('/:showcaseId/pause', showcaseController.pauseShowcase);
router.patch('/:showcaseId/close', showcaseController.closeShowcase);
router.get('/:showcaseId/display', showcaseController.getTVDisplayFeed);
router.post('/:showcaseId/heartbeat', showcaseController.recordHeartbeat);
router.get('/:showcaseId/qr', showcaseController.getShowcaseQR);

module.exports = router;
