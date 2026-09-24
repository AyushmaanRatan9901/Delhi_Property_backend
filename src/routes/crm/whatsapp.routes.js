const express = require('express');
const router = express.Router();
const whatsappController = require('../../controllers/crm/whatsapp.controller');

router.post('/share', whatsappController.createWhatsAppShare);
router.get('/shares/:shareId', whatsappController.getShareDetails);
router.post('/shares/:shareId/link', whatsappController.getShareLink);

module.exports = router;
