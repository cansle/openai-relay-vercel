// api/chat.js
// - CORS / JSON / SSE 패스스루
// - 압축 완전 차단: Unity의 "Unrecognized content-encoding" 방지
export default async function handler(req, res) {
  // ---- CORS ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(404).json({ error: "Not found" });

  // ---- Body parsing (raw/JSON 모두 대응) ----
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

  const upstream = "https://api.openai.com/v1/chat/completions";
  const isStream = !!body?.stream;

  try {
    // ---- 업스트림 호출: 압축 금지 ----
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "identity" // ✅ OpenAI 응답 압축 금지
      },
      body: JSON.stringify(body),
    });

    // ---- 공통: 우리가 내려줄 기본 헤더(압축 금지) ----
    // CDN/프록시가 재압축하지 않도록 no-transform 힌트도 함께
    const baseHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Content-Encoding": "identity",     // ✅ 항상 비압축으로 내려줌
      "Cache-Control": "no-cache, no-transform"
    };

    // ---- 선별 헤더 패스스루 (리밋/진단 위주) ----
    const passHeaders = [
      "x-ratelimit-limit-requests",
      "x-ratelimit-remaining-requests",
      "x-ratelimit-reset-requests",
      "x-ratelimit-limit-tokens",
      "x-ratelimit-remaining-tokens",
      "x-ratelimit-reset-tokens",
      "retry-after",
      "openai-model",
      "openai-processing-ms",
      "openai-version",
      "content-type" // content-type은 유지해도 OK (encoding은 우리가 고정)
    ];
    for (const k of passHeaders) {
      const v = upstreamRes.headers.get(k);
      if (v) res.setHeader(k, v);
    }
    // 우리의 강제 헤더 덮어쓰기
    Object.entries(baseHeaders).forEach(([k, v]) => res.setHeader(k, v));

    // ---- 비스트리밍(JSON) ----
    if (!isStream) {
      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      // Content-Type이 없으면 JSON으로 지정
      if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
      // (선택) Content-Length 지정: 일부 클라이언트에서 안정적
      res.setHeader("Content-Length", String(buf.length));
      return res.status(upstreamRes.status).send(buf);
    }

    // ---- 스트리밍(SSE) 패스스루 ----
    res.status(upstreamRes.status);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    // 위에서 Content-Encoding: identity, Cache-Control: no-transform 이미 설정됨
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const reader = upstreamRes.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value)); // 그대로 흘려보냄(압축 없음)
    }
    return res.end();
  } catch (err) {
    // 오류 응답도 비압축 고정
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    return res.status(502).json({ error: String(err) });
  }
}
