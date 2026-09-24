const express = require('express');
const router = express.Router();
const adminWebhook = require('../../controllers/crm/admin/adminWebhook.controller');

// External Lead Webhook Ingestion (secured via signature verification)
router.post('/leads/:source', adminWebhook.handleExternalLeadWebhook);

module.exports = router;
