const express = require('express');
const router = express.Router();
const handoffController = require('../../controllers/crm/handoff.controller');
const { requireAdminOrSuperAdmin } = require('../../middlewares/crmAuth');

router.get('/', handoffController.getHandoffs);
router.get('/:handoffId', handoffController.getHandoffById);
router.patch('/:handoffId/accept', requireAdminOrSuperAdmin, handoffController.acceptHandoff);
router.patch('/:handoffId/return', requireAdminOrSuperAdmin, handoffController.returnHandoff);
router.patch('/:handoffId/cancel', handoffController.cancelHandoff);

module.exports = router;
