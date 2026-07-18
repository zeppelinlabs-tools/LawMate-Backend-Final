/**
 * Chatbot Controller — powers the app's "AI Chat" feature directly through
 * this backend's own Anthropic key, using the exact same fetch/API pattern
 * already proven working in services/aiEnrichmentService.js.
 *
 * This replaces a hardcoded call to a separate, external Python service
 * (a different Railway deployment entirely) that the Flutter app was
 * calling directly — when that service is down or misconfigured, the
 * whole AI Chat feature broke with no way to fix it from this repo. This
 * endpoint is self-contained: as long as ANTHROPIC_API_KEY is set here,
 * the chat works regardless of anything else's deployment status.
 *
 * Response shape is deliberately {success, response} to exactly match
 * what ChatbotService.sendMessage already expects on the Flutter side —
 * only AppConstants.chatbotBaseUrl/epChatbotMessage need to change there,
 * nothing else in the app.
 */

const fs = require('fs');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are the AI legal assistant inside LawMate, an app that helps people in Pakistan understand their legal rights and options. You are speaking directly with a member of the public, not a lawyer.

Guidelines:
- Give clear, practical guidance about Pakistani law where you can, in plain language a non-lawyer can follow.
- If a question depends on the specific facts of a real case, or needs formal legal representation, say so plainly and suggest they connect with a real lawyer through the app for anything that needs one.
- Be honest about uncertainty — don't invent specific statute numbers, case citations, or procedural details you're not confident about.
- Keep answers focused and readable on a phone screen — avoid long, dense walls of text unless the question genuinely needs that much detail.
- You are not a substitute for a real lawyer, and should say so if someone appears to be relying on you for something with serious legal consequences (criminal charges, contracts, court deadlines).`;

function fileToBase64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
}

function mimeTypeForImage(filename) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'image/jpeg';
}

exports.sendMessage = async (req, res) => {
    try {
        if (!ANTHROPIC_API_KEY) {
            return res.status(500).json({
                success: false,
                msg: 'AI chat is not configured on the server yet (ANTHROPIC_API_KEY missing).'
            });
        }

        const message = (req.body.message || '').trim();
        let history = [];
        if (req.body.history) {
            try {
                history = JSON.parse(req.body.history);
            } catch (e) {
                history = [];
            }
        }

        const imageFile = req.files?.image?.[0];
        const documentFile = req.files?.document?.[0];
        const audioFile = req.files?.audio?.[0];

        // Build the Anthropic messages array from prior turns first, so
        // context carries across a conversation instead of treating every
        // message as brand new.
        const messages = history
            .filter(h => h && h.role && h.content)
            .map(h => ({
                role: h.role === 'assistant' ? 'assistant' : 'user',
                content: h.content
            }));

        // The current turn — text plus an optional image analyzed via
        // Claude's vision support. Document/audio attachments aren't
        // parsed server-side yet (no PDF/transcription library wired up
        // here) — acknowledged honestly in the prompt rather than
        // silently ignored, so the model doesn't pretend to have read
        // something it wasn't actually given.
        const currentContent = [];
        let effectiveMessage = message;

        if (documentFile && !effectiveMessage) {
            effectiveMessage = 'I\'ve attached a document but this chat can\'t read document contents yet — please describe what\'s in it or paste the relevant text, and I\'ll help from there.';
        } else if (documentFile) {
            effectiveMessage += '\n\n(A document was attached — I can\'t read its contents directly yet, please paste the relevant text if you\'d like me to look at it.)';
        }
        if (audioFile && !effectiveMessage) {
            effectiveMessage = 'A voice message was attached but this chat can\'t transcribe audio yet — please type your question instead.';
        }
        if (!effectiveMessage) effectiveMessage = 'Hello';

        if (imageFile) {
            currentContent.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mimeTypeForImage(imageFile.originalname),
                    data: fileToBase64(imageFile.path)
                }
            });
        }
        currentContent.push({ type: 'text', text: effectiveMessage });

        messages.push({ role: 'user', content: currentContent });

        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 1500,
                system: SYSTEM_PROMPT,
                messages
            })
        });

        // Clean up temp upload files regardless of outcome.
        [imageFile, documentFile, audioFile].forEach(f => {
            if (f?.path) fs.unlink(f.path, () => {});
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[chatbot] Claude API error ${response.status}: ${errText}`);
            return res.status(502).json({ success: false, msg: 'AI service returned an error. Please try again.' });
        }

        const data = await response.json();
        const reply = data.content?.[0]?.text || '';

        if (!reply.trim()) {
            return res.status(502).json({ success: false, msg: 'Empty response from AI. Please try again.' });
        }

        res.json({ success: true, response: reply });
    } catch (err) {
        console.error('[chatbot sendMessage]', err.message);
        res.status(500).json({ success: false, msg: 'Server error. Please try again.' });
    }
};
