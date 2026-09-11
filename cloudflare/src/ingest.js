const publicHeaders = {
  "access-control-allow-origin": "https://daniel9202.github.io",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers },
});

const id = () => crypto.randomUUID();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: publicHeaders });

    if (request.method === "GET" && url.pathname === "/api/public/candidates") {
      const { results = [] } = await env.DB.prepare(
        "SELECT id, city, subject_name, source_url, source_title, published_date, payload, reviewed_at FROM review_items WHERE status = 'approved' AND kind = 'candidate' ORDER BY reviewed_at DESC"
      ).all();
      const records = results.map(row => ({
        ...JSON.parse(row.payload),
        id: row.id,
        city: JSON.parse(row.payload).city || row.city,
        candidate: JSON.parse(row.payload).candidate || row.subject_name,
        source_url: JSON.parse(row.payload).source_url || row.source_url,
        source_title: JSON.parse(row.payload).source_title || row.source_title,
        published_date: JSON.parse(row.payload).published_date || row.published_date,
        approved_at: row.reviewed_at,
        last_verified: row.reviewed_at || row.published_date,
      }));
      return json({ records }, 200, publicHeaders);
    }

    if (request.method === "GET" && url.pathname === "/api/public/civic-calls") {
      const { results = [] } = await env.DB.prepare(
        "SELECT id, city, subject_name, source_url, source_title, published_date, payload, reviewed_at FROM review_items WHERE status = 'approved' AND kind = 'civic_call' ORDER BY reviewed_at DESC"
      ).all();
      const records = results.map(row => {
        const payload = JSON.parse(row.payload);
        return {
          ...payload,
          id: row.id,
          city: payload.city || row.city,
          proposer: payload.proposer || row.subject_name,
          source_url: payload.source_url || row.source_url,
          source_title: payload.source_title || row.source_title,
          published_date: payload.published_date || row.published_date,
          last_verified: row.reviewed_at || row.published_date,
          topics: Array.isArray(payload.topics) ? payload.topics : [],
          corrections: Array.isArray(payload.corrections) ? payload.corrections : [],
        };
      });
      return json({ records }, 200, publicHeaders);
    }

    if (request.method === "POST" && url.pathname === "/api/public/visit") {
      // 只接受公開網站送來的每日匿名訪客代碼；不記錄 IP 或其他識別資料。
      if (request.headers.get("Origin") !== "https://daniel9202.github.io") return json({ error: "來源不允許" }, 403, publicHeaders);
      const input = await request.json().catch(() => ({}));
      const page = String(input.page || "").trim();
      const visitorId = String(input.visitor_id || "").trim();
      if (!/^\/culture-governance-observer\/(?:[\w.-]+)?$/.test(page) || !/^[a-f0-9]{32}$/i.test(visitorId)) {
        return json({ error: "無效的流量資料" }, 400, publicHeaders);
      }
      await env.DB.prepare("INSERT OR IGNORE INTO traffic_visits (day, page_path, visitor_id) VALUES (DATE('now'), ?, ?)")
        .bind(page, visitorId).run();
      return json({ ok: true }, 202, publicHeaders);
    }

    if (request.method !== "POST" || url.pathname !== "/api/review/items") {
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
