const express = require('express');
const router = express.Router();
const inventoryController = require('../../controllers/crm/inventory.controller');

router.get('/', inventoryController.getInventory);
router.get('/available', inventoryController.getAvailableInventory);
router.get('/verified', inventoryController.getVerifiedInventory);
router.get('/:propertyId', inventoryController.getPropertyById);
router.get('/:propertyId/media', inventoryController.getPropertyMedia);
router.get('/:propertyId/videos', inventoryController.getPropertyVideos);
router.get('/:propertyId/images', inventoryController.getPropertyImages);
router.get('/:propertyId/amenities', inventoryController.getPropertyAmenities);
router.get('/:propertyId/access', inventoryController.getPropertyAccess);

module.exports = router;
