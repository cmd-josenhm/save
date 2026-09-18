import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Security proxy (formerly middleware)
export default function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' https: blob:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none';"
  );
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // CORS for API
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 200, headers: response.headers });
    }
  }

  // Block suspicious patterns
  const url = request.nextUrl.pathname + request.nextUrl.search;
  const suspiciousPatterns = [
    "../",
    "..\\",
    "/etc/passwd",
    "SELECT *",
    "UNION SELECT",
    "<script",
    "javascript:",
  ];

  for (const pattern of suspiciousPatterns) {
    if (url.toLowerCase().includes(pattern.toLowerCase())) {
      const ip = request.headers.get("x-forwarded-for") || "unknown";
      console.warn(`[SECURITY] Blocked suspicious request: ${url} from ${ip}`);
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
