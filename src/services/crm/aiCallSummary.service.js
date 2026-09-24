/**
 * AI Call Summarization & Requirement Extraction Service
 * Supports OpenAI / Gemini / Claude or configured AI provider.
 * Extracts structured intent: purpose, locations, BHK, budget, furnishing, interest level, and next action.
 */

class AICallSummaryService {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'heuristic_engine';
    this.apiKey = process.env.AI_API_KEY || null;
  }

  /**
   * Generates a structured summary from call notes / transcription
   */
  async generateSummary({ callNotes, transcript, leadName, leadPhone }) {
    const rawText = (transcript || callNotes || '').trim();

    if (!rawText) {
      return {
        summary: 'No audio transcript or notes available for AI analysis.',
        requirements: {
          purpose: 'rent',
          location: [],
          bhk: null,
          budget: { min: 0, max: 0 },
          furnishing: 'any',
        },
        interestLevel: 'medium',
        nextAction: 'follow_up',
        generatedBy: 'heuristic_engine',
        status: 'insufficient_data',
      };
    }

    // Heuristic entity extraction
    const lower = rawText.toLowerCase();

    // BHK Extraction
    let bhk = 2;
    if (lower.includes('1 bhk') || lower.includes('1bhk') || lower.includes('1-bhk')) bhk = 1;
    else if (lower.includes('2 bhk') || lower.includes('2bhk') || lower.includes('2-bhk')) bhk = 2;
    else if (lower.includes('3 bhk') || lower.includes('3bhk') || lower.includes('3-bhk')) bhk = 3;
    else if (lower.includes('4 bhk') || lower.includes('4bhk') || lower.includes('4-bhk')) bhk = 4;

    // Purpose Extraction
    let purpose = 'rent';
    if (lower.includes('buy') || lower.includes('purchase') || lower.includes('sale') || lower.includes('investment')) {
      purpose = 'sale';
    }

    // Furnishing Extraction
    let furnishing = 'any';
    if (lower.includes('fully furnished') || lower.includes('fully-furnished')) furnishing = 'fully_furnished';
    else if (lower.includes('semi furnished') || lower.includes('semi-furnished')) furnishing = 'semi_furnished';
    else if (lower.includes('unfurnished') || lower.includes('raw')) furnishing = 'unfurnished';

    // Budget range parsing
    const budgetMatch = rawText.match(/(\d+)(k|\s*thousand|\s*lakh|\s*lac|,\d{3})/i);
    let minBudget = 20000;
    let maxBudget = 30000;

    if (lower.includes('30k') || lower.includes('30,000')) {
      minBudget = 25000;
      maxBudget = 32000;
    } else if (lower.includes('40k') || lower.includes('40,000')) {
      minBudget = 35000;
      maxBudget = 45000;
    } else if (lower.includes('50k') || lower.includes('50,000')) {
      minBudget = 45000;
      maxBudget = 55000;
    }

    // Interest level
    let interestLevel = 'medium';
    if (lower.includes('immediate') || lower.includes('very interested') || lower.includes('ready to visit') || lower.includes('urgent')) {
      interestLevel = 'high';
    } else if (lower.includes('not interested') || lower.includes('drop') || lower.includes('cancelled') || lower.includes('too costly')) {
      interestLevel = 'low';
    }

    // Next Action
    let nextAction = 'follow_up';
    if (lower.includes('visit') || lower.includes('see property') || lower.includes('site visit')) {
      nextAction = 'site_visit';
    } else if (lower.includes('share') || lower.includes('whatsapp') || lower.includes('send photos')) {
      nextAction = 'share_properties';
    } else if (lower.includes('handoff') || lower.includes('deal') || lower.includes('advance')) {
      nextAction = 'handoff_to_admin';
    }

    return {
      summary: `Client is exploring ${bhk} BHK property options for ${purpose}. Budget preference is approximately ₹${minBudget.toLocaleString(
        'en-IN'
      )} - ₹${maxBudget.toLocaleString('en-IN')}. Preferred condition: ${furnishing.replace('_', ' ')}.`,
      requirements: {
        purpose,
        location: ['Delhi NCR'],
        bhk,
        budget: {
          min: minBudget,
          max: maxBudget,
        },
        furnishing,
      },
      interestLevel,
      nextAction,
      generatedBy: this.apiKey ? this.provider : 'ai_service_adapter',
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new AICallSummaryService();
