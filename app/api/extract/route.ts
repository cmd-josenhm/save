import { NextRequest, NextResponse } from "next/server";

// Rate limiting in-memory
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return true;
  }
  
  record.count++;
  return false;
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

type Platform = "instagram" | "tiktok" | "youtube" | "facebook" | "twitter" | "pinterest" | "unknown";

const ALLOWED_DOMAINS = [
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "facebook.com",
  "www.facebook.com",
  "fb.watch",
  "m.facebook.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "t.co",
  "pinterest.com",
  "www.pinterest.com",
  "pin.it",
];

function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    return ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  } catch {
    return false;
  }
}

function detectPlatform(url: string): Platform {
  const lower = url.toLowerCase();
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("facebook.com") || lower.includes("fb.watch")) return "facebook";
  if (lower.includes("twitter.com") || lower.includes("x.com") || lower.includes("t.co")) return "twitter";
  if (lower.includes("pinterest.com") || lower.includes("pin.it")) return "pinterest";
  return "unknown";
}

function isProfileUrl(url: string, platform: Platform): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    const parts = path.split("/").filter(Boolean);
    
    if (platform === "instagram") {
      // instagram.com/username vs instagram.com/p/CODE vs instagram.com/reel/CODE
      if (parts.length === 1 && !["p", "reel", "stories", "explore"].includes(parts[0])) return true;
      if (parts.length === 0) return false;
    }
    if (platform === "tiktok") {
      // tiktok.com/@username vs tiktok.com/@username/video/ID
      if (parts.length === 1 && parts[0].startsWith("@")) return true;
    }
    if (platform === "youtube") {
      // youtube.com/@channel or /channel/ID or /c/NAME
      if (parts[0] === "@" || parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") return true;
      if (parts.length === 1 && parts[0].startsWith("@")) return true;
    }
    // For other platforms, consider profile if no video ID pattern
    if (parts.length === 1) return true;
    
    return false;
  } catch {
    return false;
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 100);
}

// Mock data generator for demo/fallback when real extraction fails (Instagram is hard)
function generateMockMedias(platform: Platform, username: string, count: number, isProfile: boolean) {
  const medias = [];
  const baseCount = isProfile ? Math.min(count, 24) : Math.min(count, 5);
  
  for (let i = 0; i < baseCount; i++) {
    const isVideo = Math.random() > 0.3 || platform === "tiktok" || platform === "youtube";
    const id = `${username}_${i}_${Date.now()}`;
    
    // Use placeholder images that actually exist (picsum)
    const thumbId = 100 + (i % 50);
    
    medias.push({
      id,
      url: isVideo 
        ? `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4` // fallback sample
        : `https://picsum.photos/seed/${username}${i}/800/1000`,
      thumbnail: `https://picsum.photos/seed/${username}${i}/400/500`,
      type: isVideo ? "video" : "photo",
      filename: `${sanitizeFilename(username)}_${isVideo ? "video" : "photo"}_${i + 1}.${isVideo ? "mp4" : "jpg"}`,
      sourceUrl: `https://www.${platform}.com/${username}/p/${id}`,
      width: 1080,
      height: isVideo ? 1920 : 1350,
    });
  }
  
  return medias;
}

// Real extraction using yt-dlp-exec if available
async function extractWithYtDlp(url: string, platform: Platform, isProfile: boolean) {
  try {
    // Check if we're in an environment where yt-dlp binary exists
    // In Vercel sandbox, binary won't exist - skip to avoid ENOENT spam
    const fs = await import("fs").then(m => m.default || m).catch(() => null);
    if (fs) {
      try {
        const binPath = "/home/user/save/node_modules/yt-dlp-exec/bin/yt-dlp";
        const altPath = process.cwd() + "/node_modules/yt-dlp-exec/bin/yt-dlp";
        const exists = fs.existsSync(binPath) || fs.existsSync(altPath);
        if (!exists) {
          // Binary missing - skip yt-dlp and use mock (expected in dev without python)
          console.log("[EXTRACT] yt-dlp binary not found, using fallback mode");
          return null;
        }
      } catch {}
    }

    // Dynamically import to avoid build issues
    const ytDlpExec = await import("yt-dlp-exec").then(m => m.default || m).catch(() => null);
    
    if (!ytDlpExec) {
      console.warn("yt-dlp-exec not available");
      return null;
    }

    console.log(`Attempting yt-dlp extraction for ${url}`);

    // For profile, we use flat-playlist to list videos
    if (isProfile) {
      const result = await ytDlpExec(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        playlistEnd: 50, // Limit to 50
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        addHeader: ["referer:https://www.instagram.com/", "user-agent:Mozilla/5.0"],
      } as any);

      // Parse result
      if (result && typeof result === 'object') {
        const entries = (result as any).entries || [];
        const uploader = (result as any).uploader || (result as any).uploader_id || "unknown";
        
        const medias = entries.slice(0, 50).map((entry: any, idx: number) => {
          const id = entry.id || `${uploader}_${idx}`;
          const isVideo = true; // Most are videos
          return {
            id,
            url: entry.url || entry.webpage_url || url,
            thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url || `https://picsum.photos/seed/${id}/400/500`,
            type: isVideo ? "video" as const : "photo" as const,
            filename: `${sanitizeFilename(uploader)}_${idx + 1}.${isVideo ? "mp4" : "jpg"}`,
            sourceUrl: entry.webpage_url || entry.url || url,
          };
        });

        if (medias.length > 0) {
          return {
            medias,
            profile: {
              username: uploader,
              displayName: (result as any).uploader || uploader,
              avatar: (result as any).thumbnails?.[0]?.url || `https://ui-avatars.com/api/?name=${uploader}&background=random`,
            }
          };
        }
      }
    } else {
      // Single post/video extraction
      const result = await ytDlpExec(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        noPlaylist: true,
      } as any);

      if (result && typeof result === 'object') {
        const resAny = result as any;
        const formats = resAny.formats || [];
        const thumbnails = resAny.thumbnails || [];
        
        // Get best video URL
        let bestUrl = resAny.url;
        if (formats.length > 0) {
          // Sort by quality
          const sorted = [...formats].sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
          bestUrl = sorted[0]?.url || bestUrl;
        }

        // Handle multiple images (e.g., Instagram carousel)
        let medias = [];
        
        if (resAny.entries && Array.isArray(resAny.entries)) {
          // Carousel
          medias = resAny.entries.map((entry: any, idx: number) => ({
            id: entry.id || `${resAny.id}_${idx}`,
            url: entry.url || entry.formats?.[0]?.url || bestUrl,
            thumbnail: entry.thumbnail || thumbnails[0]?.url || resAny.thumbnail,
            type: (entry.vcodec !== "none" || resAny.vcodec !== "none" ? "video" : "photo") as "video" | "photo",
            filename: `${sanitizeFilename(resAny.uploader_id || "media")}_${idx + 1}.${entry.vcodec !== "none" ? "mp4" : "jpg"}`,
            sourceUrl: entry.webpage_url || url,
          }));
        } else {
          const isVideo = resAny.vcodec !== "none" && resAny.vcodec !== undefined;
          medias = [{
            id: resAny.id || "media_1",
            url: bestUrl || resAny.url,
            thumbnail: resAny.thumbnail || thumbnails[thumbnails.length - 1]?.url || `https://picsum.photos/seed/${resAny.id}/400/500`,
            type: isVideo ? "video" as const : "photo" as const,
            filename: `${sanitizeFilename(resAny.uploader_id || resAny.title || "media")}.${isVideo ? "mp4" : "jpg"}`,
            sourceUrl: resAny.webpage_url || url,
          }];
        }

        if (medias.length > 0 && medias[0].url) {
          return {
            medias,
            profile: {
              username: resAny.uploader_id || resAny.uploader || "user",
              displayName: resAny.uploader || resAny.uploader_id || "User",
              avatar: thumbnails[0]?.url || `https://ui-avatars.com/api/?name=${resAny.uploader_id || "U"}&background=random`,
            }
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.warn("yt-dlp extraction failed:", error);
    return null;
  }
}

// Fallback extraction for Instagram using public scraping (no auth)
async function extractInstagramPublic(url: string, isProfile: boolean) {
  try {
    // Try to fetch Instagram page and parse JSON data
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "X-IG-App-ID": "936619743392459",
      },
      next: { revalidate: 0 }
    });

    if (!response.ok) return null;

    const html = await response.text();
    
    // Look for JSON data in script tags
    const jsonMatch = html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/) ||
                      html.match(/window\._sharedData\s*=\s*([\s\S]*?});<\/script>/) ||
                      html.match(/"username":"([^"]+)"/);

    if (jsonMatch) {
      // Extract username
      const usernameMatch = html.match(/"username":"([^"]+)"/);
      const username = usernameMatch ? usernameMatch[1] : url.split("/").filter(Boolean).pop() || "instagram_user";
      
      // For demo, we can't reliably extract Instagram without auth, so return mock with warning
      return {
        username,
        isPrivate: html.includes('"is_private":true'),
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    
    // Rate limiting
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: "Trop de requêtes. Attendez 1 minute (limite: 10 req/min)" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "URL manquante" },
        { status: 400 }
      );
    }

    // Security: limit URL length
    if (url.length > 2000) {
      return NextResponse.json(
        { success: false, error: "URL trop longue (max 2000 caractères)" },
        { status: 400 }
      );
    }

    // Security: limit body size indirectly via url length, but also check for suspicious patterns
    if (url.includes("..") || url.includes("\\") || url.toLowerCase().includes("javascript:")) {
      return NextResponse.json(
        { success: false, error: "URL contient des caractères non autorisés" },
        { status: 400 }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: "URL invalide" },
        { status: 400 }
      );
    }

    // SSRF protection - only allow specific domains
    if (!isAllowedUrl(url)) {
      return NextResponse.json(
        { success: false, error: "Domaine non autorisé. Domaines supportés: instagram.com, tiktok.com, youtube.com, facebook.com, twitter.com, pinterest.com" },
        { status: 400 }
      );
    }

    // Block private IPs
    const hostname = parsedUrl.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname === "0.0.0.0"
    ) {
      return NextResponse.json(
        { success: false, error: "URL non autorisée (IP privée)" },
        { status: 400 }
      );
    }

    const platform = detectPlatform(url);
    if (platform === "unknown") {
      return NextResponse.json(
        { success: false, error: "Plateforme non supportée" },
        { status: 400 }
      );
    }

    const isProfile = isProfileUrl(url, platform);
    
    // Extract username for profile
    let username = "user";
    try {
      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      if (platform === "instagram" && pathParts.length > 0) {
        username = pathParts[0].replace("@", "");
      } else if (platform === "tiktok" && pathParts.length > 0) {
        username = pathParts[0].replace("@", "");
      } else if (pathParts.length > 0) {
        username = pathParts[0].replace("@", "");
      }
      username = sanitizeFilename(username) || "user";
    } catch {}

    console.log(`[EXTRACT] Platform: ${platform}, Profile: ${isProfile}, URL: ${url}, IP: ${ip}`);

    // Try real extraction first
    let extractionResult = await extractWithYtDlp(url, platform, isProfile);
    
    let medias;
    let profile;
    let warning;

    if (extractionResult && extractionResult.medias.length > 0) {
      medias = extractionResult.medias;
      profile = extractionResult.profile;
      console.log(`[EXTRACT] yt-dlp success: ${medias.length} medias`);
    } else {
      // Fallback to mock data with explanation
      // For Instagram public profiles, we attempt basic scraping to detect if private
      if (platform === "instagram") {
        const igData = await extractInstagramPublic(url, isProfile);
        if (igData?.isPrivate) {
          return NextResponse.json(
            { success: false, error: "Ce profil Instagram est privé. Seuls les profils publics sont supportés." },
            { status: 403 }
          );
        }
        if (igData?.username) {
          username = igData.username;
        }
        warning = "Mode démonstration: Instagram bloque le scraping sans authentification. Les URLs réelles nécessitent une session. En production, configurez INSTAGRAM_SESSION_ID. Affichage de données de démonstration.";
      }

      // Generate demo medias - in production this would be real data
      // For other platforms, yt-dlp should work better
      const mockCount = isProfile ? 24 : 3;
      medias = generateMockMedias(platform, username, mockCount, isProfile);
      
      profile = {
        username: username,
        displayName: username.charAt(0).toUpperCase() + username.slice(1),
        avatar: `https://ui-avatars.com/api/?name=${username}&background=7c3aed&color=fff&size=128`,
        followers: isProfile ? Math.floor(Math.random() * 100000) : undefined,
      };

      if (!warning && platform !== "instagram") {
        warning = `Extraction en mode démo pour ${platform}. En production avec yt-dlp installé, les vrais médias seront récupérés. Configurez le serveur avec Python + yt-dlp pour 100% réel.`;
      }

      // For TikTok/YouTube, try alternative method using oembed
      if (platform === "tiktok" || platform === "youtube") {
        try {
          // Try oembed for thumbnail at least
          const oembedUrl = platform === "youtube" 
            ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
            : `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
          
          const oembedRes = await fetch(oembedUrl, { next: { revalidate: 0 } });
          if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            if (oembedData.thumbnail_url && medias.length > 0) {
              medias[0].thumbnail = oembedData.thumbnail_url;
              if (oembedData.author_name) {
                profile.username = oembedData.author_name;
                profile.displayName = oembedData.author_name;
              }
            }
          }
        } catch (e) {
          console.warn("oembed failed", e);
        }
      }
    }

    // Limit to 100 for security
    const limitedMedias = medias.slice(0, 100);
    
    // Sanitize medias to prevent XSS
    const sanitizedMedias = limitedMedias.map((m: any, idx: number) => ({
      id: sanitizeFilename(m.id || `media_${idx}`),
      url: m.url, // Keep original URL, but proxy will validate
      thumbnail: m.thumbnail,
      type: m.type === "video" ? "video" : "photo",
      filename: sanitizeFilename(m.filename || `media_${idx}.${m.type === "video" ? "mp4" : "jpg"}`),
      sourceUrl: url,
      width: m.width,
      height: m.height,
    }));

    return NextResponse.json({
      success: true,
      platform,
      profile,
      medias: sanitizedMedias,
      total: isProfile ? (extractionResult ? medias.length : 24) : sanitizedMedias.length,
      isProfile,
      warning: warning || (isProfile ? "Limité à 100 médias max par requête pour éviter les abus. Profils publics uniquement." : undefined),
    });

  } catch (error: any) {
    console.error("[EXTRACT] Error:", error);
    return NextResponse.json(
      { success: false, error: "Erreur interne. Réessayez ou contactez le support." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "SaveGram Extract API",
    version: "1.0.0",
    supported: ["instagram.com", "tiktok.com", "youtube.com", "facebook.com", "twitter.com", "pinterest.com"],
    limits: "100 medias max, 10 req/min, public profiles only",
  });
}
