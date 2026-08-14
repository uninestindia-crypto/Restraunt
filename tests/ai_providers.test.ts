// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fn = readFileSync('supabase/functions/ai-chat/index.ts', 'utf8');

/**
 * The AI proxy, and the two properties that keep it from becoming expensive or unsafe.
 *
 * Groq and OpenRouter both speak the OpenAI /chat/completions dialect, so they share one request
 * path — which means they also share the authentication, the rate limit, the RAG retrieval and the
 * audit trail. A second copy of that path would be a second place for those controls to drift.
 */

test('the API key never leaves the server', () => {
  // A key in the client bundle is a key anyone can read and spend.
  for (const secret of ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'LIGHTNING_API_KEY']) {
    assert.match(fn, new RegExp(`Deno\\.env\\.get\\("${secret}"\\)`), `${secret} must be read server-side`);
  }

  const clientSources = [
    'src/services/ai.ts',
    'src/views/ai/AICommandCenter.tsx',
    'src/views/developer/DevConsoleView.tsx'
  ];
  for (const path of clientSources) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(
      source,
      /OPENROUTER_API_KEY|GROQ_API_KEY|sk-or-v1-/,
      `${path} must not carry an AI provider key`
    );
  }
});

test('the model is an allow-list, never whatever the client asked for', () => {
  // `model` arrives in the request body, and OpenRouter's catalogue spans two orders of
  // magnitude in price. Forwarding it unchecked lets any staff session pick the dearest one.
  assert.match(fn, /const ALLOWED_OPENROUTER_MODELS = new Set\(\[/);
  assert.match(
    fn,
    /provider\.allowedModels\.has\(payload\.model \|\| ""\) \? payload\.model! : provider\.defaultModel/,
    'an unlisted model must fall back, not be forwarded'
  );
});

test('both providers share one authenticated, rate-limited, audited path', () => {
  const branch = fn.slice(fn.indexOf('if (PROVIDERS[tier])'), fn.indexOf('// ── Tier 3'));

  assert.match(branch, /provider\.endpoint/, 'one request, parameterised by provider');
  assert.match(branch, /Bearer \$\{provider\.apiKey\}/);
  assert.equal(
    (fn.match(/api\.groq\.com/g) || []).length,
    1,
    'the Groq endpoint should appear once, in the registry'
  );

  // The controls sit before the branch, so they cannot be bypassed by choosing a provider.
  const beforeBranch = fn.slice(0, fn.indexOf('if (PROVIDERS[tier])'));
  assert.match(beforeBranch, /Invalid authorization token/, 'auth happens first');
  assert.match(beforeBranch, /Rate limit exceeded/, 'rate limiting happens first');
});

test('OpenRouter is attributed, so its spend is identifiable on the dashboard', () => {
  assert.match(fn, /"HTTP-Referer":/);
  assert.match(fn, /"X-Title": "The Taste Restaurant OS"/);
});

test('switching provider is a secret change, not a redeploy of the web bundle', () => {
  // The client hardcodes tier: 'groq'. The server resolves which provider actually has a key,
  // so setting OPENROUTER_API_KEY is enough to switch — no rebuild, no new bundle.
  assert.match(fn, /const configured = Object\.keys\(PROVIDERS\)\.filter\(\(name\) => PROVIDERS\[name\]\.apiKey\)/);
  assert.match(fn, /const resolvedTier = PROVIDERS\[tier\]\.apiKey \? tier : configured\[0\]/);

  // And it reports which one answered rather than pretending it was the one asked for.
  assert.match(fn, /tier: resolvedTier,/);
  assert.match(fn, /action: `ai_chat_\$\{resolvedTier\}`/, 'the audit row names who actually spent money');
});

test('no configured provider is a clear 503, not a silent failure', () => {
  assert.match(fn, /if \(!resolvedTier\) \{\s*\n\s*return bad\(PROVIDERS\[tier\]\.missingKeyMessage, 503\);/);
  assert.match(fn, /OpenRouter API key is not configured\. Set the OPENROUTER_API_KEY secret\./);
  assert.match(fn, /Use "groq", "openrouter", or "lightning"/);
});
