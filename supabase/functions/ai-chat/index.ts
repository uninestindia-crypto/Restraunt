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
 *  Proxies AI requests to Groq and Lightning AI.
 *  API keys are stored as Supabase secrets, never exposed to frontend.
 *  Validates staff authentication before allowing requests.
 *
 *  POST body:
 *  {
 *    tier: "groq" | "lightning",
 *    messages: [{ role: string, content: string }],
 *    model?: string,
 *    context?: object
 *  }
 * ═══════════════════════════════════════════════════
 */

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_MESSAGES = 12;
const MAX_TOKENS = 1500;

// Rate limit: max requests per staff per minute
const RATE_LIMIT_PER_MINUTE = 15;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(staffId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(staffId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(staffId, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_PER_MINUTE;
}

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
  const lightningApiKey = Deno.env.get("LIGHTNING_API_KEY");
  const lightningEndpoint = Deno.env.get("LIGHTNING_ENDPOINT");

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
    .select("role, is_active, staff_id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError || !membership) {
    return bad("Active staff membership required for AI access.", 403);
  }

  // Rate limiting per staff member
  const staffKey = `${membership.staff_id || user.id}`;
  if (isRateLimited(staffKey)) {
    return bad("Rate limit exceeded. Please wait a moment.", 429);
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

  // ── Tier 2: Groq AI ──
  if (tier === "groq") {
    if (!groqApiKey) {
      return bad("Groq API key is not configured. Set the GROQ_API_KEY secret.", 503);
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

    const model = payload.model || DEFAULT_GROQ_MODEL;

    try {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: sanitizedMessages,
          temperature: 0.7,
          max_tokens: MAX_TOKENS,
        }),
      });

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        console.error(`[ai-chat] Groq API error ${groqResponse.status}: ${errText.slice(0, 300)}`);
        return bad(`Groq API returned ${groqResponse.status}`, 502);
      }

      const groqData = await groqResponse.json();
      const content = groqData.choices?.[0]?.message?.content || "";
      const usage = groqData.usage || {};

      // Audit the AI request
      await serviceClient.from("audit_events").insert({
        store_id: membership.store_id || "the-taste",
        actor_staff_id: membership.staff_id,
        actor_auth_user_id: user.id,
        action: "ai_chat_groq",
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
        tier: "groq",
        content,
        model,
        usage,
      });
    } catch (err) {
      console.error("[ai-chat] Groq request failed:", err);
      return bad(err instanceof Error ? err.message : "Groq request failed", 502);
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

  return bad(`Unsupported AI tier: "${tier}". Use "groq" or "lightning".`);
});
