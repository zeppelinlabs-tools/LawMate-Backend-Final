/**
 * AI Enrichment Service
 * Uses Claude API to generate rich bilingual (English + Urdu) law content
 * for each scraped law title.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// claude-sonnet-4-20250514 was retired by Anthropic on June 15, 2026 —
// every enrichment call using that string returns a hard 400 error,
// which is exactly why every scraped law was stuck showing "Processing"
// forever (isEnriched never flips to true because enrichLaw() always
// throws). claude-sonnet-4-6 is the current, correct replacement.
const MODEL = 'claude-sonnet-4-6';

/**
 * Generates rich structured content for a given law title using Claude API.
 * Returns summary, key points, real-life example, and description in both EN and UR.
 *
 * @param {string} lawTitle - The title of the law (e.g. "Contract Act 1872")
 * @param {string} source - Source province/federal (e.g. "federal", "sindh")
 * @param {string} lawLink - Original government link
 * @returns {object} enriched data object
 */
// Escapes raw newline/tab/carriage-return characters, but only when they
// appear inside a JSON string literal (tracked by toggling on unescaped
// double-quotes) — control characters outside strings are legitimate
// JSON whitespace and must be left alone.
function sanitizeControlCharsInJsonStrings(str) {
    let result = '';
    let inString = false;
    let prevChar = '';
    for (const char of str) {
        if (char === '"' && prevChar !== '\\') {
            inString = !inString;
            result += char;
        } else if (inString && (char === '\n' || char === '\r' || char === '\t')) {
            result += char === '\n' ? '\\n' : char === '\r' ? '\\r' : '\\t';
        } else {
            result += char;
        }
        prevChar = char;
    }
    return result;
}

async function enrichLaw(lawTitle, source, lawLink) {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
    }

    const sourceLabel = source === 'federal'
        ? 'Federal Pakistan law'
        : `${source.charAt(0).toUpperCase() + source.slice(1)} province law (Pakistan)`;

    const prompt = `You are a Pakistani legal expert. I will give you a law title from a Pakistani government website. 
Generate the following structured information about this law. The law is real — do NOT invent laws, do NOT change the law's actual provisions. Summarize what the real law says.

Law Title: "${lawTitle}"
Source: ${sourceLabel}
Official Link: ${lawLink}

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "category": "one value from this exact list: family, criminal, business, property, labor, tax, constitutional, consumer, cyber, environmental, civil, human_rights — pick the single best match for this law's primary subject area",
  "title_ur": "law title translated to Urdu",
  "summary_en": "5 to 6 line summary in English — what this law is mainly about, what rights or protections it gives to people",
  "summary_ur": "same summary in Urdu (5 to 6 lines)",
  "keyPoints_en": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "keyPoints_ur": ["نکتہ 1", "نکتہ 2", "نکتہ 3", "نکتہ 4", "نکتہ 5"],
  "realLifeExample_en": "A real-life scenario showing how this law applies in everyday life in Pakistan — who uses it, in what situation, and what outcome it produces",
  "realLifeExample_ur": "same real-life example in Urdu",
  "description_en": "8 to 9 line detailed description in English — explain the law in more depth, its history, scope, who it applies to, key provisions",
  "description_ur": "same detailed description in Urdu (8 to 9 lines)"
}

Rules:
- "category" MUST be exactly one of: family, criminal, business, property, labor, tax, constitutional, consumer, cyber, environmental, civil, human_rights — no other values, no combinations, lowercase only
- keyPoints should have 5 to 8 points depending on how many major provisions the law has
- All Urdu text must be proper Urdu script (nastaliq style)
- Be accurate — this is for a legal app used by Pakistani citizens
- Do not add any text outside the JSON object`;

    const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: MODEL,
            // 2000 was too tight for this prompt — it asks for 4 content
            // fields (summary, key points, real-life example,
            // description) in BOTH English and Urdu, and Urdu script
            // tends to need notably more tokens than English for the
            // same meaning. Responses were getting cut off mid-field,
            // breaking the JSON and showing up as "Failed to parse
            // Claude response as JSON" with the text trailing off
            // mid-sentence. 4000 gives comfortable headroom for even a
            // law with many key points and longer descriptions.
            max_tokens: 4000,
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (e) {
        // The prompt asks for "5-6 line" / "8-9 line" text, so Claude
        // often writes multi-line summary/description values using literal
        // line breaks instead of escaped "\n" — raw control characters
        // inside a JSON string are invalid per spec and make JSON.parse
        // throw on every single response that contains them (this was
        // failing 100% of Sindh enrichments, not just an occasional one).
        // Escape stray control characters, but only inside string
        // literals, then retry before giving up.
        try {
            parsed = JSON.parse(sanitizeControlCharsInJsonStrings(cleaned));
        } catch (e2) {
            // Distinguish "ran out of tokens mid-response" from "genuinely
            // malformed JSON" — these need different fixes (raise
            // max_tokens further vs. fix the prompt), so collapsing them
            // into one generic parse error makes the real cause invisible
            // when checking GET /:source/status later.
            const truncated = data.stop_reason === 'max_tokens';
            throw new Error(
                truncated
                    ? `Response truncated (hit max_tokens limit) before completing valid JSON. First 300 chars: ${cleaned.slice(0, 300)}`
                    : `Failed to parse Claude response as JSON: ${cleaned.slice(0, 300)}`
            );
        }
    }

    const VALID_CATEGORIES = [
        'family', 'criminal', 'business', 'property', 'labor',
        'tax', 'constitutional', 'consumer', 'cyber', 'environmental',
        'civil', 'human_rights'
    ];
    const category = VALID_CATEGORIES.includes(parsed.category)
        ? parsed.category
        : 'uncategorized';

    return {
        category,
        title_ur: parsed.title_ur || '',
        summary_en: parsed.summary_en || '',
        summary_ur: parsed.summary_ur || '',
        keyPoints_en: Array.isArray(parsed.keyPoints_en) ? parsed.keyPoints_en : [],
        keyPoints_ur: Array.isArray(parsed.keyPoints_ur) ? parsed.keyPoints_ur : [],
        realLifeExample_en: parsed.realLifeExample_en || '',
        realLifeExample_ur: parsed.realLifeExample_ur || '',
        description_en: parsed.description_en || '',
        description_ur: parsed.description_ur || ''
    };
}

module.exports = { enrichLaw };
