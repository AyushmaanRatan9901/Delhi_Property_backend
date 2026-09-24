const express = require('express');
const router = express.Router();
const matchingController = require('../../controllers/crm/matching.controller');

router.post('/search', matchingController.searchMatchingProperties);
router.get('/leads/:leadId/matches', matchingController.getMatchesForLead);
router.get('/leads/:leadId/matches/:propertyId', matchingController.getSpecificPropertyMatch);
router.post('/leads/:leadId/matches/refresh', matchingController.refreshMatches);

module.exports = router;
