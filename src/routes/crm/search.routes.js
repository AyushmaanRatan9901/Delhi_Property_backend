const express = require('express');
const router = express.Router();
const searchController = require('../../controllers/crm/search.controller');

router.get('/', searchController.globalSearch);

module.exports = router;
