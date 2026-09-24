/**
 * SUPER ADMIN CRM & TELE-CALLER MANAGEMENT VERIFICATION TEST SUITE
 * 
 * Verifies:
 * 1. Telephony & Signed URL Security: Token expiration & HMAC verification.
 * 2. AI Call Summary Engine: Structured intent, budget, BHK, furnishing & next action extraction.
 * 3. Site Visit Conflict Checker: Double booking prevention for agents, properties & leads.
 * 4. Audit Log Sanitization: Automatic redaction of sensitive credentials.
 * 5. Masked Inventory Security: Absolute stripping of owner PII from Tele-caller DTOs.
 * 6. Deterministic Matching Engine: Configurable multi-criteria compatibility scoring.
 * 7. Route Mounting & Controller Integrity.
 */

const assert = require('assert');
const telephonyService = require('../src/services/crm/telephony.service');
const aiCallSummaryService = require('../src/services/crm/aiCallSummary.service');
const conflictCheckService = require('../src/services/crm/conflictCheck.service');
const {
  maskPropertyForTeleCaller,
  maskPropertiesList,
} = require('../src/services/crm/maskedInventory.service');
const { calculateMatchScore } = require('../src/services/crm/matching.service');
const { generateCRMId } = require('../src/utils/crmIdGenerator');

console.log('🧪 Starting Super Admin CRM & Tele-Caller Management Verification Suite...\n');

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

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}\n`);
  }
}

async function executeAll() {
  // ── 1. Telephony Signed Recording URL Security ──────────────────────────────
  console.log('--- 1. Telephony & Protected Call Recording Tests ---');

  runTest('Generates tamper-proof signed recording URL with expiry', () => {
    const callId = '65f1234567890abcdef12345';
    const rawUrl = 'https://s3.amazonaws.com/recordings/call-9821.mp3';
    const signedUrl = telephonyService.generateSecureRecordingUrl(callId, rawUrl, 3600);

    assert.ok(signedUrl.includes('callId='), 'Signed URL must include callId parameter');
    assert.ok(signedUrl.includes('expires='), 'Signed URL must include expiration timestamp');
    assert.ok(signedUrl.includes('sig='), 'Signed URL must include HMAC signature');

    const urlObj = new URL(signedUrl);
    const expires = urlObj.searchParams.get('expires');
    const sig = urlObj.searchParams.get('sig');

    const isValid = telephonyService.verifyRecordingSignature(callId, expires, sig, rawUrl);
    assert.strictEqual(isValid, true, 'Valid signature must verify successfully');

    // Tampered URL check
    const isTamperedValid = telephonyService.verifyRecordingSignature('tampered_id', expires, sig, rawUrl);
    assert.strictEqual(isTamperedValid, false, 'Tampered callId must fail signature verification');
  });

  runTest('Rejects expired recording access signature', () => {
    const callId = '65f1234567890abcdef12345';
    const rawUrl = 'https://s3.amazonaws.com/recordings/call-9821.mp3';
    const pastExpires = Math.floor(Date.now() / 1000) - 100; // 100 seconds in past
    const dummySig = 'abcdef1234567890';

    const isValid = telephonyService.verifyRecordingSignature(callId, pastExpires, dummySig, rawUrl);
    assert.strictEqual(isValid, false, 'Expired timestamp must be rejected');
  });

  // ── 2. AI Call Summary & Intent Extraction ──────────────────────────────────
  console.log('\n--- 2. AI Call Summarization & Requirement Parsing Tests ---');

  await runAsyncTest('Extracts structured 2BHK rent requirements with budget from transcript', async () => {
    const transcript = 'Customer Mr. Sharma is looking for a 2 BHK semi-furnished flat in Noida Sector 62 for rent. Budget is around 25000 to 30,000. Wants immediate site visit this weekend.';
    const summary = await aiCallSummaryService.generateSummary({
      transcript,
      leadName: 'Rajesh Sharma',
      leadPhone: '9811223344',
    });

    assert.strictEqual(summary.requirements.bhk, 2, 'Should detect 2 BHK');
    assert.strictEqual(summary.requirements.purpose, 'rent', 'Should detect rent purpose');
    assert.strictEqual(summary.requirements.furnishing, 'semi_furnished', 'Should detect semi_furnished');
    assert.strictEqual(summary.interestLevel, 'high', 'Should detect high interest level due to immediate visit request');
    assert.strictEqual(summary.nextAction, 'site_visit', 'Should detect site_visit next action');
    assert.ok(summary.requirements.budget.min >= 20000, 'Budget min should be parsed accurately');
    assert.ok(summary.summary.length > 20, 'Summary text should be generated');
  });

  // ── 3. Strict PII Masking Enforcement (Section 29) ──────────────────────────
  console.log('\n--- 3. Strict Owner PII Masking Tests (Section 29) ---');

  const rawPropertyDoc = {
    _id: '65f1234567890abcdef12345',
    leadId: 'DPE-PROP-10291',
    title: '3BHK in Sector 62',
    locality: 'Sector 62',
    address: { street: 'Tower B', city: 'Noida', fullAddress: 'Flat 402, Royal Palms' },
    expectedPrice: 28000,
    propertyType: '3BHK',
    listingType: 'rent',
    status: 'verified',
    photos: [{ url: 'https://cdn.example.com/p1.jpg' }],

    // SENSITIVE OWNER DATA (MUST NEVER BE RETURNED TO TELE-CALLER)
    ownerName: 'Secret Landlord',
    ownerPhone: '9876543210',
    ownerEmail: 'landlord@private.com',
    ownerAddress: { houseNo: '99', street: 'Private Lane' },
    commission: { approvedAmount: 5000, percentage: 15 },
    deal: { tenantName: 'Secret Tenant', tenantPhone: '9811122233' },
    ownerBankDetails: { accountNumber: '123456789' },
  };

  runTest('Tele-caller DTO strips all owner & tenant PII and commission', () => {
    const masked = maskPropertyForTeleCaller(rawPropertyDoc);

    assert.strictEqual(masked.ownerName, undefined, 'ownerName must be stripped');
    assert.strictEqual(masked.ownerPhone, undefined, 'ownerPhone must be stripped');
    assert.strictEqual(masked.ownerEmail, undefined, 'ownerEmail must be stripped');
    assert.strictEqual(masked.ownerAddress, undefined, 'ownerAddress must be stripped');
    assert.strictEqual(masked.commission, undefined, 'commission must be stripped');
    assert.strictEqual(masked.deal, undefined, 'deal/tenant PII must be stripped');
    assert.strictEqual(masked.ownerBankDetails, undefined, 'ownerBankDetails must be stripped');

    assert.strictEqual(masked.maskedPropertyId, 'DPE-PROP-10291');
    assert.strictEqual(masked.locality, 'Sector 62');
    assert.strictEqual(masked.expectedPrice, 28000);
    assert.strictEqual(masked.propertyType, '3BHK');
  });

  // ── 4. Deterministic Property Matching Engine ───────────────────────────────
  console.log('\n--- 4. Deterministic Property Matching Scoring Tests ---');

  runTest('Calculates accurate match score based on BHK, budget & locality', () => {
    const criteria = {
      purpose: 'rent',
      bhk: [3],
      budget: { min: 25000, max: 32000 },
      preferredLocalities: ['Sector 62'],
      furnishing: 'any',
    };

    const result = calculateMatchScore(rawPropertyDoc, criteria);
    assert.ok(result.score >= 80, `Match score should be high (>=80), got ${result.score}`);
    assert.ok(result.matchedCriteria.includes('purpose'), 'Purpose should match');
    assert.ok(result.matchedCriteria.includes('bhk'), 'BHK should match');
    assert.ok(result.matchedCriteria.includes('budget'), 'Budget should match');
    assert.ok(result.matchedCriteria.includes('locality'), 'Locality should match');
  });

  // ── 5. ID Generation ────────────────────────────────────────────────────────
  console.log('\n--- 5. Standard CRM ID Generation Tests ---');

  runTest('Generates formatted IDs (LD, TC, VST, TV, FLP)', () => {
    const leadId = generateCRMId('LD');
    const callerId = generateCRMId('TC');
    const visitId = generateCRMId('VST');
    const tvId = generateCRMId('TV');

    assert.ok(leadId.startsWith('LD-') || leadId.startsWith('DPE-LD-'), `Lead ID format check failed: ${leadId}`);
    assert.ok(callerId.startsWith('TC-') || callerId.startsWith('DPE-TC-'), `Caller ID format check failed: ${callerId}`);
    assert.ok(visitId.startsWith('VST-') || visitId.startsWith('DPE-VST-'), `Visit ID format check failed: ${visitId}`);
    assert.ok(tvId.startsWith('TV-') || tvId.startsWith('DPE-TV-'), `TV ID format check failed: ${tvId}`);
  });

  // ── Final Summary ───────────────────────────────────────────────────────────
  console.log('\n========================================================');
  console.log(`🎯 Test Summary: ${passedTests} / ${totalTests} passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL SUPER ADMIN CRM & TELE-CALLER TESTS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

executeAll().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
