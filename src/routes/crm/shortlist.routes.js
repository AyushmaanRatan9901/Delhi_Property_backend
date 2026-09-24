const express = require('express');
const router = express.Router();
const shortlistController = require('../../controllers/crm/shortlist.controller');

router.get('/leads/:leadId/shortlist', shortlistController.getLeadShortlist);
router.post('/leads/:leadId/shortlist', shortlistController.addToShortlist);
router.delete('/leads/:leadId/shortlist', shortlistController.clearLeadShortlist);
router.get('/leads/:leadId/shortlist/history', shortlistController.getShortlistHistory);
router.post('/leads/:leadId/shortlist/:propertyId', shortlistController.addSinglePropertyToShortlist);
router.patch('/leads/:leadId/shortlist/:propertyId', shortlistController.updateShortlistItem);
router.delete('/leads/:leadId/shortlist/:propertyId', shortlistController.removePropertyFromShortlist);

module.exports = router;
