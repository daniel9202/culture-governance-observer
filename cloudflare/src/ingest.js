const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const id = () => crypto.randomUUID();

export default {
  async fetch(request, env) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/review/items") {
      return json({ error: "找不到路徑" }, 404);
    }

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!env.INGEST_TOKEN || token !== env.INGEST_TOKEN) return json({ error: "未授權" }, 401);

    try {
      const input = await request.json();
      const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
      const sourceUrl = String(input.source_url || payload.source_url || "").trim();
      if (!/^https?:\/\//.test(sourceUrl)) return json({ error: "來源網址無效" }, 400);

      const exists = await env.DB.prepare("SELECT id FROM review_items WHERE source_url = ?")
        .bind(sourceUrl).first();
      if (exists) return json({ id: exists.id, error: "此來源已在審核台中" }, 409);

      const itemId = id();
      await env.DB.prepare("INSERT INTO review_items (id, kind, city, subject_name, source_url, source_title, published_date, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(itemId, input.kind === "civic_call" ? "civic_call" : "candidate", String(input.city || payload.city || ""), String(input.subject_name || payload.candidate || ""), sourceUrl, String(input.source_title || payload.source_title || ""), String(input.published_date || payload.published_date || ""), JSON.stringify(payload)).run();
      await env.DB.prepare("INSERT INTO review_events (item_id, action, actor, detail) VALUES (?, ?, ?, ?)")
        .bind(itemId, "created", "research-importer", JSON.stringify({ kind: input.kind || "candidate" })).run();
      return json({ id: itemId, status: "pending" }, 201);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "伺服器錯誤" }, 500);
    }
  },
};
