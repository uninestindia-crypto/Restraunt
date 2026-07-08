// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Edge function not configured" }, 500);
  }

  // Validate Authorization header (only service role or matching staff key)
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.includes(serviceRoleKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const { content, metadata = {}, store_id = "the-taste" } = await req.json();
    if (!content || !content.trim()) {
      return jsonResponse({ error: "Content is required" }, 400);
    }

    // ── Generate Vector Embeddings (384-dims GTE model) ──
    // @ts-ignore
    const session = new (globalThis as any).Supabase.ai.Session('gte-small');
    const response = await session.run(content.trim(), {
      mean_pool: true,
      normalize: true,
    });
    const embedding = Array.from(response);

    // ── Store document in DB ──
    const client = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await client.from("document_embeddings").insert({
      store_id,
      content,
      metadata,
      embedding
    }).select("id").single();

    if (error) {
      console.error("[ingest-document] DB insert error:", error);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ ok: true, id: data.id });
  } catch (err) {
    console.error("[ingest-document] Process error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
