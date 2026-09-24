/**
 * MASKED INVENTORY SERVICE
 * 
 * Strict data masking for Tele-caller / CRM roles.
 * Strips all owner PII, tenant PII, internal commissions, and private verification notes.
 */

const maskPropertyForTeleCaller = (propertyDoc) => {
  if (!propertyDoc) return null;

  // If it's a Mongoose document, convert to plain object
  const prop = typeof propertyDoc.toObject === 'function' ? propertyDoc.toObject() : { ...propertyDoc };

  // Determine BHK from propertyType or direct field
  let bhk = prop.bhk || 0;
  if (!bhk && prop.propertyType) {
    if (prop.propertyType.includes('1BHK') || prop.propertyType.includes('1 BHK')) bhk = 1;
    else if (prop.propertyType.includes('2BHK') || prop.propertyType.includes('2 BHK')) bhk = 2;
    else if (prop.propertyType.includes('3BHK') || prop.propertyType.includes('3 BHK')) bhk = 3;
    else if (prop.propertyType.includes('4BHK') || prop.propertyType.includes('4 BHK')) bhk = 4;
  }

  // Format images and videos
  const images = (prop.photos || []).map((p) => (typeof p === 'string' ? p : p.url)).filter(Boolean);
  if (prop.coverPhoto && !images.includes(prop.coverPhoto)) {
    images.unshift(prop.coverPhoto);
  }
  const videos = (prop.videos || []).map((v) => (typeof v === 'string' ? v : v.url)).filter(Boolean);

  // General area address without private house number or specific owner flat details
  const publicAddress = {
    landmark: prop.address?.landmark || '',
    locality: prop.locality || prop.address?.locality || '',
    city: prop.address?.city || 'Delhi NCR',
    state: prop.address?.state || 'Delhi',
    pincode: prop.address?.pincode || '',
  };

  return {
    _id: prop._id,
    propertyId: prop.leadId || prop._id?.toString(),
    maskedPropertyId: prop.leadId || prop._id?.toString(),
    title: prop.title || `${prop.propertyType || 'Property'} in ${prop.locality || 'Delhi NCR'}`,
    description: prop.description || '',
    propertyType: prop.propertyType || 'apartment',
    listingType: (prop.listingType || 'rent').toLowerCase(),
    locality: prop.locality || prop.address?.locality || 'Delhi NCR',
    city: prop.address?.city || 'Delhi NCR',
    area: prop.builtUpArea || prop.carpetArea || prop.superArea || prop.area || 0,
    builtUpArea: prop.builtUpArea || 0,
    carpetArea: prop.carpetArea || 0,
    superArea: prop.superArea || 0,
    bhk: bhk,
    floor: prop.floorNumber || prop.floor || 0,
    totalFloors: prop.totalFloors || 0,
    price: prop.expectedPrice || prop.rent?.amount || 0,
    expectedPrice: prop.expectedPrice || prop.rent?.amount || 0,
    priceType: (prop.listingType || 'rent').toLowerCase() === 'sale' ? 'total' : 'monthly',
    deposit: prop.securityDeposit || prop.deposit || 0,
    maintenanceCharge: prop.maintenanceCharge || 0,
    furnishing: prop.furnishing || 'unfurnished',
    amenities: Array.isArray(prop.amenities) ? prop.amenities : [],
    images: images,
    coverPhoto: prop.coverPhoto || images[0] || null,
    videos: videos,
    hasVideo: videos.length > 0,
    availability: prop.status === 'verified' || prop.isAvailable === true,
    availableFrom: prop.availableFrom || null,
    verificationStatus: prop.status || 'new',
    verifiedAt: prop.verification?.verifiedAt || prop.updatedAt || null,
    publicAddress,
    features: {
      parking: prop.features?.parking || false,
      lift: prop.features?.lift || false,
      gatedSecurity: prop.features?.gatedSecurity || false,
      powerBackup: prop.features?.powerBackup || false,
      waterSupply24x7: prop.features?.waterSupply24x7 || false,
    },
    // Meta flags
    videoAvailable: videos.length > 0,
    siteVisitAvailable: prop.status === 'verified',
  };
};

const maskPropertiesList = (propertiesList) => {
  if (!Array.isArray(propertiesList)) return [];
  return propertiesList.map(maskPropertyForTeleCaller).filter(Boolean);
};

module.exports = {
  maskPropertyForTeleCaller,
  maskPropertiesList,
};
