// api/search.js — Vercel serverless function
// Proxies YouTube Data API search using your secret key

export default async function handler(req, res) {
  // Allow requests from your frontend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query, maxResults } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });

  const YT_KEY = process.env.YOUTUBE_API_KEY;
  if (!YT_KEY) return res.status(500).json({ error: "YouTube API key not configured on server" });

  // Published after = 1 year ago
  const publishedAfter = new Date();
  publishedAfter.setFullYear(publishedAfter.getFullYear() - 1);

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(maxResults || 8),
    regionCode: "IN",
    relevanceLanguage: "en",
    videoDuration: "medium",
    order: "relevance",
    publishedAfter: publishedAfter.toISOString(),
    key: YT_KEY
  });

  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || "YouTube API error" });
    }

    const results = (data.items || []).map(it => ({
      video_id: it.id.videoId,
      title: it.snippet.title,
      description: it.snippet.description,
      channel: it.snippet.channelTitle,
      published_at: it.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
      thumbnail: `https://img.youtube.com/vi/${it.id.videoId}/mqdefault.jpg`
    }));

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
