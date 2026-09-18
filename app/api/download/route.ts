import { NextRequest, NextResponse } from "next/server";

// This endpoint is for future use - bulk download job tracking
// For now, client-side ZIP is used, but this can be extended to server-side processing

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { medias, username, platform } = body;

    if (!medias || !Array.isArray(medias)) {
      return NextResponse.json({ error: "Medias manquants" }, { status: 400 });
    }

    if (medias.length > 100) {
      return NextResponse.json({ error: "Limite de 100 médias dépassée" }, { status: 400 });
    }

    // In a real implementation, this would:
    // 1. Create a job ID
    // 2. Store job in Redis/DB
    // 3. Process downloads in background worker
    // 4. Return job ID for polling

    // For MVP, we just validate and return success
    // Actual ZIP creation is done client-side for Vercel compatibility

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    return NextResponse.json({
      success: true,
      jobId,
      message: "Téléchargement côté client recommandé pour Vercel. Utilisez /api/proxy pour chaque média + JSZip.",
      total: medias.length,
      platform,
      username,
    });

  } catch (error) {
    console.error("[DOWNLOAD] Error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "SaveGram Download API - Client-side ZIP recommended",
    usage: "POST { medias: string[], username: string, platform: string }",
    note: "For Vercel serverless, client-side ZIP via JSZip is more efficient than server-side",
  });
}
