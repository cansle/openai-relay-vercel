// api/chat.js - 학생 성적 서술 생성기 전용 중계 서버
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(404).json({ error: "Post 요청만 가능합니다." });

  // 1. GAS에서 보낸 데이터 받기
  const { prompt, systemRole } = req.body;

  try {
    // 2. OpenAI API 호출 (형식 변환 포함)
    const upstreamRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo", // 또는 gpt-4o
        messages: [
          { role: "system", content: systemRole || "학생 생활기록부 작성 전문 교사입니다." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      }),
    });

    const data = await upstreamRes.json();

    // 3. 에러 발생 시 처리
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: data.error?.message || "OpenAI 호출 에러" });
    }

    // 4. 중요: GAS가 바로 읽을 수 있게 { text: "..." } 형태로만 반환
    const aiText = data.choices[0].message.content.trim();
    res.status(200).json({ text: aiText });

  } catch (err) {
    res.status(502).json({ error: "서버 연결 오류: " + String(err) });
  }
}
