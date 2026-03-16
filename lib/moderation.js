// Two-Tier LLM Moderation System using Ollama Cloud API
// Tier 1: Filter bigotry, hate speech, slurs
// Tier 2: Identify logical fallacies, manipulation, information asymmetry

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3';

async function callOllama(messages) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(OLLAMA_API_KEY && { Authorization: `Bearer ${OLLAMA_API_KEY}` }),
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.message?.content || '';
}

// Tier 1: Hard filter for bigotry/hate speech
async function tier1Check(content) {
  const response = await callOllama([
    {
      role: 'system',
      content: `You are a content moderation system. Analyze the following post for:
- Hate speech, slurs, or bigotry targeting race, ethnicity, gender, sexuality, religion, disability
- Direct threats of violence
- Dehumanizing language

Respond with ONLY valid JSON (no markdown, no code fences):
{"blocked": true/false, "reason": "brief explanation or null"}`,
    },
    { role: 'user', content },
  ]);

  try {
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    console.error('Tier 1 parse error:', response);
    return { blocked: false, reason: null };
  }
}

// Tier 2: Flag logical fallacies and manipulation tactics
async function tier2Check(content) {
  const response = await callOllama([
    {
      role: 'system',
      content: `You are an information quality analyst. Analyze the following post for:
- Logical fallacies (ad hominem, straw man, false dichotomy, appeal to emotion, slippery slope, etc.)
- Manipulation tactics (gaslighting, DARVO, sea-lioning, gish gallop)
- Information asymmetry exploitation (misleading statistics, cherry-picked data, out-of-context quotes)

Respond with ONLY valid JSON (no markdown, no code fences):
{"flagged": true/false, "issues": ["list of identified issues"] or [], "summary": "brief explanation or null"}`,
    },
    { role: 'user', content },
  ]);

  try {
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    console.error('Tier 2 parse error:', response);
    return { flagged: false, issues: [], summary: null };
  }
}

// Run both tiers of moderation
async function moderate(content) {
  // Skip very short content
  if (content.trim().length < 5) {
    return { status: 'approved', tier1: null, tier2: null };
  }

  // Tier 1: Hard block check
  let tier1;
  try {
    tier1 = await tier1Check(content);
  } catch (err) {
    console.error('Tier 1 moderation error:', err.message);
    // On API failure, allow post but mark as unmoderated
    return { status: 'unmoderated', tier1: { error: err.message }, tier2: null };
  }

  if (tier1.blocked) {
    return { status: 'blocked', tier1, tier2: null };
  }

  // Tier 2: Soft flag for fallacies/manipulation
  let tier2;
  try {
    tier2 = await tier2Check(content);
  } catch (err) {
    console.error('Tier 2 moderation error:', err.message);
    return { status: 'approved', tier1, tier2: { error: err.message } };
  }

  const status = tier2.flagged ? 'flagged' : 'approved';
  return { status, tier1, tier2 };
}

module.exports = { moderate };
