import { NextRequest, NextResponse } from "next/server";

const ALLOWED_MEDIA_DOMAINS = [
  "instagram.com",
  "cdninstagram.com",
  "fbcdn.net",
  "tiktok.com",
  "tiktokcdn.com",
  "musical.ly",
  "youtube.com",
  "googlevideo.com",
  "ytimg.com",
  "facebook.com",
  "fbcdn.net",
  "twitter.com",
  "twimg.com",
  "t.co",
  "pinterest.com",
  "pinimg.com",
  "picsum.photos",
  "sample-videos.com",
  "ui-avatars.com",
  "i.imgur.com",
];

function isAllowedMediaUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    
    // Allow if matches allowed list or is common CDN pattern
    return ALLOWED_MEDIA_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith("." + domain) || hostname.endsWith(domain)
    ) || hostname.includes("cdn") || hostname.includes("picsum") || hostname.includes("sample") || hostname.includes("googlevideo");
  } catch {
    return false;
  }
}

// In-memory cache for media to reduce load
const mediaCache = new Map<string, { data: ArrayBuffer; contentType: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

function cleanCache() {
  const now = Date.now();
  for (const [key, value] of mediaCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      mediaCache.delete(key);
    }
  }
  if (mediaCache.size > MAX_CACHE_SIZE) {
    const oldest = Array.from(mediaCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) mediaCache.delete(oldest[0]);
  }
}

function sanitizeFilename(filename: string): string {
  // Prevent path traversal and XSS
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .substring(0, 100) || "media";
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");
    let filename = searchParams.get("filename") || "media";

    if (!url) {
      return NextResponse.json({ error: "URL manquante" }, { status: 400 });
    }

    // Validate URL length (prevent DoS)
    if (url.length > 2000) {
      return NextResponse.json({ error: "URL trop longue" }, { status: 400 });
    }

    filename = sanitizeFilename(filename);

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "URL invalide" }, { status: 400 });
    }

    // SSRF protection - block private IPs and localhost
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"];
    const blockedPrefixes = ["192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "169.254."];

    if (blockedHosts.includes(hostname) || blockedPrefixes.some(prefix => hostname.startsWith(prefix))) {
      console.warn(`[PROXY] Blocked private IP: ${hostname}`);
      return NextResponse.json({ error: "IP privée bloquée" }, { status: 403 });
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Protocole non autorisé" }, { status: 400 });
    }

    // Check allowed domains (log but allow CDN variations for flexibility)
    if (!isAllowedMediaUrl(url)) {
      console.warn(`[PROXY] Unusual domain requested: ${hostname}, allowing but logging`);
    }

    cleanCache();

    // Check cache
    const cacheKey = url;
    const cached = mediaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[PROXY] Cache hit for ${filename}`);
      return new NextResponse(cached.data, {
        headers: {
          "Content-Type": cached.contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "public, max-age=300",
          "X-Cache": "HIT",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    console.log(`[PROXY] Fetching ${url} as ${filename}`);

    // Fetch media with timeout and retries
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/*,video/*,*/*;q=0.8",
          "Referer": "https://www.instagram.com/",
          "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
        // @ts-ignore - next options
        next: { revalidate: 0 },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error(`[PROXY] Failed to fetch ${url}: ${response.status}`);
      // Try to return a placeholder for demo purposes if original fails
      if (url.includes("picsum.photos")) {
        // For demo, redirect to a working placeholder
        const placeholderUrl = `https://picsum.photos/400/500?random=${Date.now()}`;
        try {
          const placeholderRes = await fetch(placeholderUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (placeholderRes.ok) {
            const buf = await placeholderRes.arrayBuffer();
            return new NextResponse(buf, {
              headers: {
                "Content-Type": "image/jpeg",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "public, max-age=60",
                "X-Proxy-Fallback": "true",
              },
            });
          }
        } catch {}
      }
      
      return NextResponse.json(
        { error: `Erreur lors du fetch: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    
    // Validate content type is media (allow but warn)
    const allowedContentTypes = ["image/", "video/", "application/octet-stream", "binary/"];
    if (!allowedContentTypes.some(t => contentType.startsWith(t))) {
      console.warn(`[PROXY] Unexpected content-type: ${contentType} for ${url}`);
      // Still allow - might be CDN with weird headers
    }

    const arrayBuffer = await response.arrayBuffer();

    // Limit size to 100MB
    if (arrayBuffer.byteLength > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 100MB)" }, { status: 413 });
    }

    // Empty file check
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Fichier vide" }, { status: 400 });
    }

    // Cache
    mediaCache.set(cacheKey, {
      data: arrayBuffer,
      contentType,
      timestamp: Date.now(),
    });

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": arrayBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=300",
        "X-Cache": "MISS",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });

  } catch (error: any) {
    console.error("[PROXY] Error:", error?.message || error);
    
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout lors du téléchargement" }, { status: 504 });
    }

    // For network errors, return a helpful error but don't leak internal details
    return NextResponse.json(
      { error: "Erreur proxy: impossible de récupérer le média. Réessayez." },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
