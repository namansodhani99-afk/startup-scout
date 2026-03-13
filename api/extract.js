export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured in Vercel environment variables" });

  const { video } = req.body || {};
  if (!video) return res.status(400).json({ error: "video data is required" });

  const prompt = `Analyze this YouTube video and extract early-stage Indian startup details.

Title: ${video.title}
Channel: ${video.channel}
Published: ${video.published_at || "unknown"}
Description: ${(video.description || "").slice(0, 700)}

INCLUDE: founder journeys, product demos, behind-the-scenes, interviews, pitches for Indian companies under 4 years old.
SKIP: large established companies (Zomato/Swiggy/CRED/Paytm etc), general news, list/top-10 videos.

Return ONLY this JSON or exactly the word null:
{"company_name":"","tagline":"","sector":"Fintech|Healthtech|Edtech|SaaS|D2C|Agritech|Logistics|Deeptech|Climatetech|Other","stage":"Pre-seed|Seed|Series A","city":"","founded_year":"","team_size":"","description":"","founders":[{"name":"","title":"","linkedin":""}],"website":"","video_type":"demo|founder_story|interview|behind_scenes|pitch|funding_news","confidence":"high|medium|low"}`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + GROQ_KEY
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 800,
        temperature: 0.1,
        messages: [
          { role: "system", content: "You identify early-stage Indian startups from YouTube metadata. Reply ONLY with valid JSON or the word null. No markdown, no backticks, no explanation." },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "Groq API error" });

    let raw = (data.choices?.[0]?.message?.content || "").trim();
    if (!raw || raw === "null" || raw.toLowerCase().startsWith("null")) return res.status(200).json({ startup: null });

    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    try {
      const p = JSON.parse(raw);
      if (!p?.company_name || p.confidence === "low") return res.status(200).json({ startup: null });
      return res.status(200).json({ startup: p });
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const p = JSON.parse(m[0]);
          if (!p?.company_name) return res.status(200).json({ startup: null });
          return res.status(200).json({ startup: p });
        } catch { return res.status(200).json({ startup: null }); }
      }
      return res.status(200).json({ startup: null });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
