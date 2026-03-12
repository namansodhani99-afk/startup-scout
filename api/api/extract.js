// api/extract.js — Vercel serverless function
// Proxies Groq AI extraction using your secret key

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { video } = req.body;
  if (!video) return res.status(400).json({ error: "video data is required" });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: "Groq API key not configured on server" });

  const systemMsg = "You are a specialist at identifying early-stage Indian startups from YouTube video metadata. You respond ONLY with valid JSON or the word null. Never add markdown, backticks, or explanation.";

  const userMsg = `Analyze this YouTube video and extract early-stage Indian startup details.

Title: ${video.title}
Channel: ${video.channel}
Published: ${video.published_at || "unknown"}
Description: ${(video.description || "").slice(0, 800)}

INCLUDE if this video is about:
- A founder telling their startup journey or how they built it
- A product or service demo by an Indian company
- Behind-the-scenes of an early team building their startup
- An interview with a founder about their early-stage company
- A pitch or funding announcement for pre-seed or seed stage
- Any Indian company under 4 years old showcasing their work

SKIP (return null) if:
- It is general news not about one specific company
- The company is large and established (Zomato, Swiggy, CRED etc)
- It is a list or aggregator video
- It is clearly not about any specific company

If it is a valid startup, return this exact JSON:
{"company_name":"string","tagline":"one line of what they do","sector":"Fintech or Healthtech or Edtech or SaaS or D2C or Agritech or Logistics or Deeptech or Climatetech or Other","stage":"Pre-seed or Seed or Series A","city":"city name or null","founded_year":"year or null","team_size":"number or null","description":"2 sentences about what they do and what makes them interesting","founders":[{"name":"string","title":"string","linkedin":"url or null"}],"website":"url or null","video_type":"demo or founder_story or interview or behind_scenes or pitch or funding_news","confidence":"high or medium or low"}

Return null if not an early-stage Indian startup video.`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1024,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || "Groq API error" });
    }

    let raw = (data.choices?.[0]?.message?.content || "").trim();

    if (!raw || raw === "null" || raw.toLowerCase().startsWith("null")) {
      return res.status(200).json({ startup: null });
    }

    // Strip accidental markdown fences
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.company_name || parsed.confidence === "low") {
        return res.status(200).json({ startup: null });
      }
      return res.status(200).json({ startup: parsed });
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (!parsed?.company_name) return res.status(200).json({ startup: null });
          return res.status(200).json({ startup: parsed });
        } catch {
          return res.status(200).json({ startup: null });
        }
      }
      return res.status(200).json({ startup: null });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
