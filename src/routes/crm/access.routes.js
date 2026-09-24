const express = require('express');
const router = express.Router();
const accessController = require('../../controllers/crm/access.controller');

router.get('/', accessController.getCRMAccess);
router.get('/permissions', accessController.getPermissions);

module.exports = router;
