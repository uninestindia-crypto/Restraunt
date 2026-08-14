// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

/**
 * ═══════════════════════════════════════════════════
 *  AI Chat Edge Function — Secure Proxy
 *
 *  Proxies AI requests to Groq, OpenRouter, and Lightning AI.
 *  API keys are stored as Supabase secrets, never exposed to the frontend —
 *  a key in the client bundle is a key anyone can read and spend.
 *  Validates staff authentication before allowing requests.
 *
 *  POST body:
 *  {
 *    tier: "groq" | "openrouter" | "lightning",
 *    messages: [{ role: string, content: string }],
 *    model?: string,
 *    context?: object
 *  }
 * ═══════════════════════════════════════════════════
 */

/**
 * Groq and OpenRouter both speak the OpenAI /chat/completions dialect, so they
 * share one request path — and, more importantly, the same authentication,
 * rate limiting, RAG retrieval and audit trail. A second copy of that path
 * would be a second place for those controls to drift out of step.
 */
type OpenAiCompatibleProvider = {
  label: string;
  endpoint: string;
  apiKey?: string;
  defaultModel: string;
  allowedModels: Set<string>;
  /** Provider-specific headers, e.g. OpenRouter's attribution pair. */
  headers?: Record<string, string>;
  missingKeyMessage: string;
};

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const ALLOWED_GROQ_MODELS = new Set([DEFAULT_GROQ_MODEL, "llama-3.1-8b-instant"]);

/**
 * An allow-list, not a pass-through. OpenRouter exposes hundreds of models at
 * wildly different prices, and `model` arrives in the request body — which the
 * client controls. Without this, any staff session could bill the restaurant
 * for the most expensive model on the catalogue.
 *
 * To add one: put it here, deploy, done. Do not read it from the body.
 */
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct";
const ALLOWED_OPENROUTER_MODELS = new Set([
  DEFAULT_OPENROUTER_MODEL,
  "meta-llama/llama-3.1-8b-instruct",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-haiku",
  "openai/gpt-4o-mini",
]);
const MAX_MESSAGES = 12;
const MAX_TOKENS = 1500;
const RATE_LIMIT_PER_MINUTE = 15;

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function bad(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return bad("Method not allowed.", 405);
  }

  // ── Environment Setup ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
  const lightningApiKey = Deno.env.get("LIGHTNING_API_KEY");
  const lightningEndpoint = Deno.env.get("LIGHTNING_ENDPOINT");

  const PROVIDERS: Record<string, OpenAiCompatibleProvider> = {
    groq: {
      label: "Groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqApiKey,
      defaultModel: DEFAULT_GROQ_MODEL,
      allowedModels: ALLOWED_GROQ_MODELS,
      missingKeyMessage: "Groq API key is not configured. Set the GROQ_API_KEY secret.",
    },
    openrouter: {
      label: "OpenRouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterApiKey,
      defaultModel: DEFAULT_OPENROUTER_MODEL,
      allowedModels: ALLOWED_OPENROUTER_MODELS,
      // OpenRouter attributes usage to an app via these two headers. Optional to
      // the API, and useful on the dashboard for telling this restaurant's spend
      // apart from anything else sharing the key.
      headers: {
        "HTTP-Referer": Deno.env.get("OPENROUTER_SITE_URL") || "https://thetaste.in",
        "X-Title": "The Taste Restaurant OS",
      },
      missingKeyMessage: "OpenRouter API key is not configured. Set the OPENROUTER_API_KEY secret.",
    },
  };

  if (!supabaseUrl || !serviceRoleKey) {
    return bad("AI chat function is not configured.", 500);
  }

  // ── Authenticate Staff ──
  const token = bearerToken(req);
  if (!token) {
    return bad("Missing authorization token.", 401);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return bad("Invalid authorization token.", 401);
  }

  // Verify active staff membership
  const { data: membership, error: membershipError } = await serviceClient
    .from("staff_memberships")
    .select("role, is_active, staff_id, store_id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError || !membership) {
    return bad("Active staff membership required for AI access.", 403);
  }

  // ── Parse Request ──
  let payload: {
    tier?: string;
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    context?: Record<string, unknown>;
    query?: string;
    intent?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const tier = (payload.tier || "groq").toLowerCase();

  // Atomically persist and count attempts across every Edge worker.
  const { data: attemptAccepted, error: rateLimitError } = await serviceClient.rpc(
    "consume_staff_ai_attempt",
    {
      target_auth_user_id: user.id,
      target_store_id: membership.store_id,
      target_staff_id: membership.staff_id,
      target_tier: tier,
      max_attempts: RATE_LIMIT_PER_MINUTE,
      window_seconds: 60,
    },
  );
  if (rateLimitError) {
    console.error("[ai-chat] Rate-limit RPC failed:", rateLimitError);
    return bad("AI request protection is temporarily unavailable.", 503);
  }
  if (!attemptAccepted) {
    return bad("Rate limit exceeded. Please wait a moment.", 429);
  }

  // ── Tier 2: the OpenAI-compatible providers (Groq, OpenRouter) ──
  if (PROVIDERS[tier]) {
    // Which provider serves a chat request is an operational question — which
    // key does this deployment hold? — not a product one. Resolving it here
    // means switching provider is a secret change, not a rebuild and redeploy
    // of the web bundle. The client keeps asking for "groq"; if only
    // OPENROUTER_API_KEY is set, OpenRouter answers, and the response says so
    // in its `tier` field rather than quietly pretending otherwise.
    const configured = Object.keys(PROVIDERS).filter((name) => PROVIDERS[name].apiKey);
    const resolvedTier = PROVIDERS[tier].apiKey ? tier : configured[0];

    if (!resolvedTier) {
      return bad(PROVIDERS[tier].missingKeyMessage, 503);
    }

    const provider = PROVIDERS[resolvedTier];
    if (resolvedTier !== tier) {
      console.log(`[ai-chat] "${tier}" has no key configured; serving with ${provider.label}.`);
    }

    const messages = Array.isArray(payload.messages) ? payload.messages.slice(-MAX_MESSAGES) : [];
    if (messages.length === 0) {
      return bad("At least one message is required.");
    }

    // Sanitize messages
    const sanitizedMessages = messages.map((m) => ({
      role: ["system", "user", "assistant"].includes(m.role) ? m.role : "user",
      content: String(m.content || "").slice(0, 4000),
    }));

    // ── Vector Search & RAG Retrieval Phase ──
    let queryEmbedding: number[] | null = null;
    if (Array.isArray(payload.context?.queryEmbedding)) {
      queryEmbedding = payload.context.queryEmbedding;
    } else if (payload.context?.query && typeof (globalThis as any).Supabase !== "undefined" && (globalThis as any).Supabase.ai) {
      try {
        const session = new (globalThis as any).Supabase.ai.Session('gte-small');
        const lastUserMessage = String(payload.context.query || "");
        if (lastUserMessage) {
          const response = await session.run(lastUserMessage, {
            mean_pool: true,
            normalize: true,
          });
          queryEmbedding = Array.from(response);
        }
      } catch (e) {
        console.warn("[ai-chat] Local Edge Function embedding generation failed:", e);
      }
    }

    let retrievedContext = "";
    if (queryEmbedding) {
      try {
        const { data: documents, error: dbErr } = await serviceClient.rpc("match_documents", {
          query_embedding: queryEmbedding,
          match_threshold: 0.50,
          match_count: 4,
          filter_store_id: membership.store_id || "the-taste"
        });

        if (dbErr) {
          console.error("[ai-chat] Error matching documents:", dbErr);
        } else if (Array.isArray(documents) && documents.length > 0) {
          retrievedContext = documents
            .map((doc: any) => `[Source: ${doc.metadata?.source || "Document"}] ${doc.content}`)
            .join("\n\n");
          console.log(`[ai-chat] Retrieved ${documents.length} matching document(s) for RAG.`);
        }
      } catch (err) {
        console.error("[ai-chat] Document retrieval RPC failed:", err);
      }
    }

    if (retrievedContext) {
      const sysMsg = sanitizedMessages.find(m => m.role === "system");
      if (sysMsg) {
        sysMsg.content += `\n\n--- ADDITIONAL RETRIEVED CONTEXT (RAG) ---\n${retrievedContext}\n-------------------------------------------\nUse the retrieved context above to answer the user's question, citing the source where appropriate.`;
      } else {
        sanitizedMessages.unshift({
          role: "system",
          content: `You are a helpful restaurant assistant. Use the following context to help answer the user's question:\n\n${retrievedContext}`
        });
      }
    }

    // `payload.model` is client-controlled, so an unlisted value silently falls
    // back rather than being forwarded.
    const model = provider.allowedModels.has(payload.model || "") ? payload.model! : provider.defaultModel;

    try {
      const providerResponse = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          ...(provider.headers || {}),
        },
        body: JSON.stringify({
          model,
          messages: sanitizedMessages,
          temperature: 0.7,
          max_tokens: MAX_TOKENS,
        }),
      });

      if (!providerResponse.ok) {
        const errText = await providerResponse.text();
        console.error(`[ai-chat] ${provider.label} API error ${providerResponse.status}: ${errText.slice(0, 300)}`);
        return bad(`${provider.label} API returned ${providerResponse.status}`, 502);
      }

      const providerData = await providerResponse.json();
      const content = providerData.choices?.[0]?.message?.content || "";
      const usage = providerData.usage || {};

      // Audit the AI request
      await serviceClient.from("audit_events").insert({
        store_id: membership.store_id || "the-taste",
        actor_staff_id: membership.staff_id,
        actor_auth_user_id: user.id,
        action: `ai_chat_${resolvedTier}`,
        target_table: "ai",
        details: {
          model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      });

      return jsonResponse({
        ok: true,
        tier: resolvedTier,
        content,
        model,
        usage,
      });
    } catch (err) {
      console.error(`[ai-chat] ${provider.label} request failed:`, err);
      return bad(err instanceof Error ? err.message : `${provider.label} request failed`, 502);
    }
  }

  // ── Tier 3: Lightning AI ──
  if (tier === "lightning") {
    if (!lightningApiKey || !lightningEndpoint) {
      return bad("Lightning AI is not configured. Set LIGHTNING_API_KEY and LIGHTNING_ENDPOINT secrets.", 503);
    }

    const query = String(payload.query || "").slice(0, 4000);
    const intent = String(payload.intent || "").slice(0, 100);

    if (!query) {
      return bad("A query is required for Lightning AI.");
    }

    try {
      const lightningResponse = await fetch(lightningEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lightningApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          intent,
          context: payload.context || {},
        }),
      });

      if (!lightningResponse.ok) {
        const errText = await lightningResponse.text();
        console.error(`[ai-chat] Lightning API error ${lightningResponse.status}: ${errText.slice(0, 300)}`);
        return bad(`Lightning API returned ${lightningResponse.status}`, 502);
      }

      const lightningData = await lightningResponse.json();

      // Audit
      await serviceClient.from("audit_events").insert({
        store_id: membership.store_id || "the-taste",
        actor_staff_id: membership.staff_id,
        actor_auth_user_id: user.id,
        action: "ai_chat_lightning",
        target_table: "ai",
        details: { intent, queryLength: query.length },
      });

      return jsonResponse({
        ok: true,
        tier: "lightning",
        content: lightningData.result || lightningData.content || lightningData.message || JSON.stringify(lightningData),
        raw: lightningData,
      });
    } catch (err) {
      console.error("[ai-chat] Lightning request failed:", err);
      return bad(err instanceof Error ? err.message : "Lightning request failed", 502);
    }
  }

  return bad(`Unsupported AI tier: "${tier}". Use "groq", "openrouter", or "lightning".`);
});
