// Vercel Serverless Function (대시보드 배포용)
// - POST /api/chat
// - JSON/스트리밍(SSE) 모두 패스스루
// - CORS + 프리플라이트 처리
// 환경변수: OPENAI_API_KEY (Vercel 프로젝트에 등록)

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(404).json({ error: "Not found" });

  // --- 요청 바디 안전 파싱 ---
  let body = req.body;
  if (!body || typeof body !== "object") {
    try {
      const chunks = [];
      for await (const ch of req) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
      const raw = Buffer.concat(chunks).toString("utf8") || "{}";
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const upstream = "https://api.openai.com/v1/chat/completions"; // 미국 egress

  const headers = {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    // 필요 시:
    // "OpenAI-Organization": "<org_id>",
    // "OpenAI-Project": "<project_id>",
  };

  const isStream = !!body?.stream;

  try {
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // 진단/리밋 헤더 패스스루
    for (const [k, v] of upstreamRes.headers.entries()) {
      try { res.setHeader(k, v); } catch {}
    }

    if (!isStream) {
      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      return res.status(upstreamRes.status).send(buf);
    }

    // 스트리밍: SSE 패스스루
    res.status(upstreamRes.status);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const reader = upstreamRes.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (err) {
    return res.status(502).json({ error: String(err) });
  }
}
