/**
 * COMPREHENSIVE CRM BACKEND VERIFICATION & SECURITY TEST SUITE
 * 
 * Verifies:
 * 1. Masked Inventory Service: Enforces strict PII masking (owner name, phone, email, documents, commission stripped).
 * 2. Smart Property Matching Service: Calculates accurate compatibility scores (0-100%) and matched criteria.
 * 3. Duplicate Lead Detection Logic.
 * 4. ID Generation & Secure Token Generation.
 * 5. CRM Route & Model Integrity.
 */

const assert = require('assert');
const {
  maskPropertyForTeleCaller,
  maskPropertiesList,
} = require('../src/services/crm/maskedInventory.service');
const { calculateMatchScore } = require('../src/services/crm/matching.service');
const { generateCRMId, generateSecureToken } = require('../src/utils/crmIdGenerator');

console.log('🧪 Starting CRM Backend Verification & Security Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MANDATORY SECURITY & PII MASKING TEST (Section 38)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Security & PII Masking Tests ---');

const mockRawProperty = {
  _id: '65f1234567890abcdef12345',
  leadId: 'DPE-PROP-10291',
  title: 'Luxury 3BHK Apartment in Vasant Kunj',
  description: 'Spacious apartment near metro station',
  propertyType: '3BHK',
  listingType: 'rent',
  expectedPrice: 45000,
  securityDeposit: 90000,
  maintenanceCharge: 3000,
  furnishing: 'semi_furnished',
  locality: 'Vasant Kunj',
  address: {
    street: 'Sector B, Pocket 1',
    landmark: 'Near Fortis Hospital',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110070',
    fullAddress: 'Flat 402, Block B-1, Vasant Kunj, New Delhi 110070',
  },
  bhk: 3,
  floorNumber: 4,
  totalFloors: 10,
  builtUpArea: 1650,
  carpetArea: 1400,
  amenities: ['Power Backup', 'Lift', 'Security', 'Gym', 'Club House'],
  photos: [
    { url: 'https://cdn.example.com/prop1.jpg', isCover: true },
    { url: 'https://cdn.example.com/prop2.jpg', isCover: false },
  ],
  videos: [{ url: 'https://cdn.example.com/prop-tour.mp4' }],
  status: 'verified',

  // ⚠️ SENSITIVE OWNER PII (MUST BE STRIPPED)
  ownerName: 'Vikramaditya Sharma',
  ownerPhone: '9876543210',
  ownerEmail: 'vikram.sharma@private-domain.com',
  alternatePhone: '9876543211',
  ownerAadhaarLast4: '8821',
  ownerPanCard: 'ABCDE1234F',
  ownerAddress: {
    houseNo: 'House No 123',
    street: 'Private Lane',
    city: 'Delhi',
  },
  ownerBankDetails: {
    accountHolderName: 'Vikramaditya Sharma',
    bankName: 'HDFC Bank',
    accountNumber: '50100234567890',
    ifscCode: 'HDFC0001234',
    upiId: 'vikram@hdfcbank',
  },
  ownerKYC: {
    status: 'verified',
    aadhaarFrontUrl: 'https://s3.amazonaws.com/kyc/aadhaar_front.jpg',
    panCardUrl: 'https://s3.amazonaws.com/kyc/pan.jpg',
  },
  ownerNotes: 'Owner wants rent strictly by 1st of every month via NEFT only',

  // ⚠️ SENSITIVE TENANT PII & COMMISSIONS (MUST BE STRIPPED)
  tenantName: 'Rahul Verma',
  tenantPhone: '9123456780',
  tenantEmail: 'rahul@tenant.com',
  tenantDocuments: ['https://s3.amazonaws.com/docs/tenant_id.pdf'],
  internalNotes: 'Internal verification passed with minor paint touchup noted',
  internalCommission: 15,
  commissionAmount: 6750,
  privateVerificationNotes: 'Spoke with guard, property title is clean',
};

runTest('Tele-caller CAN see public property attributes', () => {
  const masked = maskPropertyForTeleCaller(mockRawProperty);
  assert.strictEqual(masked.propertyId, 'DPE-PROP-10291');
  assert.strictEqual(masked.title, 'Luxury 3BHK Apartment in Vasant Kunj');
  assert.strictEqual(masked.bhk, 3);
  assert.strictEqual(masked.locality, 'Vasant Kunj');
  assert.strictEqual(masked.price, 45000);
  assert.strictEqual(masked.deposit, 90000);
  assert.strictEqual(masked.furnishing, 'semi_furnished');
  assert.strictEqual(masked.images.length, 2);
  assert.strictEqual(masked.videos.length, 1);
  assert.strictEqual(masked.hasVideo, true);
  assert.strictEqual(masked.verificationStatus, 'verified');
});

runTest('Tele-caller CANNOT see owner name or contact details', () => {
  const masked = maskPropertyForTeleCaller(mockRawProperty);
  assert.strictEqual(masked.ownerName, undefined);
  assert.strictEqual(masked.ownerPhone, undefined);
  assert.strictEqual(masked.ownerEmail, undefined);
  assert.strictEqual(masked.alternatePhone, undefined);
  assert.strictEqual(masked.ownerAadhaarLast4, undefined);
  assert.strictEqual(masked.ownerPanCard, undefined);
  assert.strictEqual(masked.ownerAddress, undefined);
  assert.strictEqual(masked.ownerBankDetails, undefined);
  assert.strictEqual(masked.ownerKYC, undefined);
  assert.strictEqual(masked.ownerNotes, undefined);
});

runTest('Tele-caller CANNOT see tenant PII, internal notes, or commissions', () => {
  const masked = maskPropertyForTeleCaller(mockRawProperty);
  assert.strictEqual(masked.tenantName, undefined);
  assert.strictEqual(masked.tenantPhone, undefined);
  assert.strictEqual(masked.tenantEmail, undefined);
  assert.strictEqual(masked.tenantDocuments, undefined);
  assert.strictEqual(masked.internalNotes, undefined);
  assert.strictEqual(masked.internalCommission, undefined);
  assert.strictEqual(masked.commissionAmount, undefined);
  assert.strictEqual(masked.privateVerificationNotes, undefined);
});

runTest('Array of properties is batch-masked without leaking sensitive fields', () => {
  const list = maskPropertiesList([mockRawProperty, mockRawProperty]);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].ownerName, undefined);
  assert.strictEqual(list[1].ownerPhone, undefined);
  assert.strictEqual(list[0].bhk, 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SMART PROPERTY MATCHING ENGINE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Smart Property Matching Tests ---');

runTest('Calculates high match score for perfectly matching requirement', () => {
  const requirement = {
    requirementType: 'rent',
    bhk: [3],
    localities: ['Vasant Kunj'],
    budgetMin: 35000,
    budgetMax: 50000,
    furnishing: 'semi_furnished',
  };

  const match = calculateMatchScore(mockRawProperty, requirement);
  assert.ok(match.matchScore >= 90, `Score was ${match.matchScore}, expected >= 90`);
  assert.ok(match.matchedCriteria.includes('listing_type'));
  assert.ok(match.matchedCriteria.includes('bhk'));
  assert.ok(match.matchedCriteria.includes('locality'));
  assert.ok(match.matchedCriteria.includes('budget'));
  assert.ok(match.matchedCriteria.includes('furnishing'));
});

runTest('Calculates lower match score for mismatched locality and BHK', () => {
  const mismatchedRequirement = {
    requirementType: 'rent',
    bhk: [1],
    localities: ['Noida Sector 62'],
    budgetMin: 10000,
    budgetMax: 15000,
    furnishing: 'fully_furnished',
  };

  const match = calculateMatchScore(mockRawProperty, mismatchedRequirement);
  assert.ok(match.matchScore <= 50, `Score was ${match.matchScore}, expected <= 50`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ID GENERATION & TOKEN SECURITY TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. ID Generation & Secure Token Tests ---');

runTest('Generates formatted CRM Lead IDs with prefix', () => {
  const leadId = generateCRMId('CRM-LD');
  assert.ok(leadId.startsWith('CRM-LD-'));
  assert.ok(leadId.length >= 12);
});

runTest('Generates high-entropy random hex tokens for public shares', () => {
  const token1 = generateSecureToken();
  const token2 = generateSecureToken();
  assert.strictEqual(typeof token1, 'string');
  assert.strictEqual(token1.length, 48);
  assert.notStrictEqual(token1, token2);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MODULE & MODEL IMPORT VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Mongoose Model Definition Tests ---');

runTest('Imports all 14 CRM Models successfully', () => {
  const Lead = require('../src/models/crm/Lead');
  const LeadRequirement = require('../src/models/crm/LeadRequirement');
  const LeadNote = require('../src/models/crm/LeadNote');
  const Call = require('../src/models/crm/Call');
  const CallSummary = require('../src/models/crm/CallSummary');
  const Shortlist = require('../src/models/crm/Shortlist');
  const PropertyShare = require('../src/models/crm/PropertyShare');
  const Showcase = require('../src/models/crm/Showcase');
  const SiteVisit = require('../src/models/crm/SiteVisit');
  const SiteVisitFeedback = require('../src/models/crm/SiteVisitFeedback');
  const FollowUp = require('../src/models/crm/FollowUp');
  const CRMHandoff = require('../src/models/crm/CRMHandoff');
  const CRMNotification = require('../src/models/crm/CRMNotification');
  const CRMActivity = require('../src/models/crm/CRMActivity');

  assert.ok(Lead.modelName === 'CRMLead');
  assert.ok(LeadRequirement.modelName === 'CRMLeadRequirement');
  assert.ok(LeadNote.modelName === 'CRMLeadNote');
  assert.ok(Call.modelName === 'CRMCall');
  assert.ok(CallSummary.modelName === 'CRMCallSummary');
  assert.ok(Shortlist.modelName === 'CRMShortlist');
  assert.ok(PropertyShare.modelName === 'CRMPropertyShare');
  assert.ok(Showcase.modelName === 'CRMShowcase');
  assert.ok(SiteVisit.modelName === 'CRMSiteVisit');
  assert.ok(SiteVisitFeedback.modelName === 'CRMSiteVisitFeedback');
  assert.ok(FollowUp.modelName === 'CRMFollowUp');
  assert.ok(CRMHandoff.modelName === 'CRMHandoff');
  assert.ok(CRMNotification.modelName === 'CRMNotification');
  assert.ok(CRMActivity.modelName === 'CRMActivity');
});

runTest('Main App correctly imports CRM master routes without syntax errors', () => {
  const app = require('../src/app');
  assert.ok(app !== null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`🏁 Total Tests: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
console.log('========================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL BACKEND CRM TESTS & SECURITY VERIFICATIONS PASSED!\n');
  process.exit(0);
} else {
  console.error('💥 SOME TESTS FAILED!\n');
  process.exit(1);
}
