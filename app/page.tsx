"use client";

import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type MediaItem = {
  id: string;
  url: string;
  thumbnail: string;
  type: "video" | "photo";
  filename: string;
  sourceUrl: string;
  width?: number;
  height?: number;
};

type Platform = "instagram" | "tiktok" | "youtube" | "facebook" | "twitter" | "pinterest" | "unknown";

type ExtractResponse = {
  success: boolean;
  platform: Platform;
  profile?: {
    username: string;
    displayName: string;
    avatar: string;
    followers?: number;
  };
  medias: MediaItem[];
  total: number;
  isProfile: boolean;
  error?: string;
  warning?: string;
};

const PLATFORM_ICONS: Record<Platform, string> = {
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
  facebook: "👍",
  twitter: "🐦",
  pinterest: "📌",
  unknown: "🔗",
};

const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  twitter: "Twitter / X",
  pinterest: "Pinterest",
  unknown: "Lien",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");
  const [zipProgress, setZipProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const detectPlatform = (inputUrl: string): Platform => {
    const lower = inputUrl.toLowerCase();
    if (lower.includes("instagram.com")) return "instagram";
    if (lower.includes("tiktok.com")) return "tiktok";
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
    if (lower.includes("facebook.com") || lower.includes("fb.watch")) return "facebook";
    if (lower.includes("twitter.com") || lower.includes("x.com") || lower.includes("t.co")) return "twitter";
    if (lower.includes("pinterest.com") || lower.includes("pin.it")) return "pinterest";
    return "unknown";
  };

  const handleExtract = async () => {
    if (!url.trim()) {
      setError("Veuillez coller un lien valide");
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError("URL invalide. Exemple: https://www.instagram.com/username/");
      return;
    }

    const platform = detectPlatform(url);
    if (platform === "unknown") {
      setError("Plateforme non supportée. Supporté: Instagram, TikTok, YouTube, Facebook, Twitter, Pinterest");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setProgress(5);
    setStatus(`Analyse du lien ${PLATFORM_NAMES[platform]}...`);

    try {
      // Simulate progress for UX
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 90) return prev + Math.random() * 10;
          return prev;
        });
      }, 400);

      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      clearInterval(progressInterval);

      const data: ExtractResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'extraction");
      }

      setProgress(100);
      setStatus(`Trouvé ${data.total} médias !`);
      setResult(data);

      // Auto-start download after short delay for profile mode
      if (data.isProfile && data.medias.length > 0) {
        setTimeout(() => {
          handleBulkDownload(data);
        }, 800);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erreur inconnue. Réessayez.");
      setProgress(0);
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDownload = async (data: ExtractResponse = result!) => {
    if (!data || data.medias.length === 0) return;

    setIsDownloading(true);
    setDownloadedCount(0);
    setZipProgress(0);
    setStatus(`Préparation du téléchargement...`);

    try {
      const zip = new JSZip();
      const folderName = data.profile ? `${data.profile.username}_${data.platform}` : `savegram_${Date.now()}`;
      const folder = zip.folder(folderName);

      if (!folder) throw new Error("Impossible de créer le ZIP");

      let completed = 0;
      const total = Math.min(data.medias.length, 100); // Limit to 100
      const mediasToDownload = data.medias.slice(0, 100);

      // Download with concurrency limit (3 at a time)
      const concurrency = 3;
      const queue = [...mediasToDownload];
      
      const downloadBatch = async () => {
        while (queue.length > 0) {
          const media = queue.shift()!;
          try {
            setStatus(`Téléchargement ${completed + 1}/${total}: ${media.filename}`);

            // Use proxy to avoid CORS
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(media.url)}&filename=${encodeURIComponent(media.filename)}`;
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
              console.warn(`Failed to fetch ${media.filename}: ${response.status}`);
              // Try direct fetch as fallback
              const directRes = await fetch(media.url);
              if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
              const blob = await directRes.blob();
              folder.file(media.filename, blob);
            } else {
              const blob = await response.blob();
              folder.file(media.filename, blob);
            }

            completed++;
            setDownloadedCount(completed);
            setZipProgress(Math.round((completed / total) * 100));
            
          } catch (e) {
            console.warn(`Failed to download ${media.filename}`, e);
            completed++;
            setDownloadedCount(completed);
            // Continue even if one fails
          }
        }
      };

      // Run concurrent downloads
      const workers = Array(concurrency).fill(0).map(() => downloadBatch());
      await Promise.all(workers);

      setStatus(`Compression du ZIP (${completed} fichiers)...`);
      
      const content = await zip.generateAsync(
        { 
          type: "blob",
          compression: "STORE",
        },
        (metadata) => {
          setZipProgress(metadata.percent);
        }
      );

      const finalFilename = `${folderName}.zip`;
      saveAs(content, finalFilename);

      setStatus(`✅ Téléchargement terminé ! ${completed} fichiers dans ${finalFilename}`);
      setIsDownloading(false);

      // Show confetti effect or success
      setTimeout(() => {
        setStatus(`✅ ${completed} médias téléchargés avec succès ! Fichier: ${finalFilename}`);
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(`Erreur lors du téléchargement: ${err.message}`);
      setIsDownloading(false);
    }
  };

  const handleSingleDownload = async (media: MediaItem) => {
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(media.url)}&filename=${encodeURIComponent(media.filename)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Erreur proxy");
      const blob = await response.blob();
      saveAs(blob, media.filename);
    } catch (e) {
      // Fallback direct link
      window.open(media.url, "_blank");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    }
  };

  const clearAll = () => {
    setUrl("");
    setResult(null);
    setError("");
    setProgress(0);
    setStatus("");
    setDownloadedCount(0);
    setIsDownloading(false);
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl bg-black/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-lg">
              S
            </div>
            <div>
              <h1 className="font-bold text-xl leading-none">SaveGram</h1>
              <p className="text-xs text-white/60">Téléchargeur Universel</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">Sans filigrane</span>
            <span className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 hidden sm:inline">100% Gratuit</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 md:py-16">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-6xl font-black mb-4 leading-tight">
            Téléchargez tout un
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              profil en 1 clic
            </span>
          </h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Instagram, TikTok, YouTube, Facebook, Twitter, Pinterest. Collez le lien d&apos;un profil, on récupère toutes les vidéos et photos sans filigrane. ZIP automatique.
          </p>

          <div className="flex flex-wrap justify-center gap-2 mt-6 text-sm">
            {Object.entries(PLATFORM_NAMES).filter(([k])=>k!=="unknown").map(([key, name]) => (
              <span key={key} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5">
                <span>{PLATFORM_ICONS[key as Platform]}</span> {name}
              </span>
            ))}
          </div>
        </div>

        {/* Input Card */}
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-[24px] p-6 md:p-8 shadow-2xl">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleExtract()}
                  placeholder="Collez le lien du profil ou du post ici... ex: https://instagram.com/username"
                  className="w-full pl-12 pr-28 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:bg-white/[0.07] outline-none transition-all text-white placeholder:text-white/30"
                />
                <button
                  onClick={handlePaste}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium transition-colors"
                >
                  Coller
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleExtract}
                  disabled={loading || isDownloading}
                  className="flex-1 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-bold text-white shadow-lg shadow-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <span className="group-hover:scale-110 transition-transform">⬇️</span>
                      Télécharger
                    </>
                  )}
                </button>
                {(result || error || url) && (
                  <button
                    onClick={clearAll}
                    className="px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              {(loading || isDownloading) && (
                <div className="space-y-3 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70 flex items-center gap-2">
                      {isDownloading ? (
                        <>
                          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          {status}
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                          {status}
                        </>
                      )}
                    </span>
                    <span className="font-mono text-purple-300">
                      {isDownloading ? `${downloadedCount}/${result?.total || 0}` : `${Math.round(progress)}%`}
                    </span>
                  </div>
                  
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                      style={{ width: `${isDownloading ? zipProgress : progress}%` }}
                    >
                      <div className="absolute inset-0 shimmer" />
                    </div>
                  </div>

                  {isDownloading && (
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
                        <div className="text-2xl font-black text-purple-400">{downloadedCount}</div>
                        <div className="text-xs text-white/50">Téléchargés</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
                        <div className="text-2xl font-black text-pink-400">{result ? Math.min(result.total, 100) - downloadedCount : 0}</div>
                        <div className="text-xs text-white/50">Restants</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
                        <div className="text-2xl font-black text-blue-400">{result?.total || 0}</div>
                        <div className="text-xs text-white/50">Total</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex gap-3">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <div className="font-bold">Erreur</div>
                    <div className="text-red-300/80">{error}</div>
                  </div>
                </div>
              )}

              {result && !isDownloading && result.medias.length > 0 && (
                <div className="mt-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">✅</span>
                    <div>
                      <div className="font-bold text-green-300">Téléchargement terminé !</div>
                      <div className="text-sm text-white/60">{status}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center mb-3 text-lg">1️⃣</div>
              <h3 className="font-bold mb-1">Collez le lien</h3>
              <p className="text-sm text-white/50">Lien de profil complet ou d&apos;un post/reel/story individuel</p>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center mb-3 text-lg">2️⃣</div>
              <h3 className="font-bold mb-1">Compteur en direct</h3>
              <p className="text-sm text-white/50">On scanne et télécharge tout avec compteur animé en temps réel</p>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center mb-3 text-lg">3️⃣</div>
              <h3 className="font-bold mb-1">ZIP sans filigrane</h3>
              <p className="text-sm text-white/50">Tout est compressé dans un ZIP unique prêt à télécharger</p>
            </div>
          </div>
        </div>

        {/* Results Gallery */}
        {result && result.medias.length > 0 && (
          <div className="max-w-5xl mx-auto mt-12">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                {result.profile && (
                  <>
                    <img
                      src={result.profile.avatar || `https://ui-avatars.com/api/?name=${result.profile.username}&background=random`}
                      alt={result.profile.username}
                      className="w-12 h-12 rounded-full border-2 border-white/20"
                    />
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {result.profile.displayName || result.profile.username}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">
                          {PLATFORM_ICONS[result.platform]} {PLATFORM_NAMES[result.platform]}
                        </span>
                      </div>
                      <div className="text-sm text-white/50">@{result.profile.username} • {result.total} médias • {result.isProfile ? "Profil complet" : "Post unique"}</div>
                    </div>
                  </>
                )}
                {!result.profile && (
                  <div className="font-bold">
                    {PLATFORM_ICONS[result.platform]} {result.total} médias trouvés
                  </div>
                )}
              </div>

              <button
                onClick={() => handleBulkDownload()}
                disabled={isDownloading}
                className="px-5 py-2.5 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <span>📦</span> Télécharger ZIP ({Math.min(result.total, 100)})
              </button>
            </div>

            {result.warning && (
              <div className="mb-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm">
                ⚠️ {result.warning}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {result.medias.slice(0, 100).map((media, idx) => (
                <div key={media.id} className="group relative aspect-[4/5] rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                  <img
                    src={media.thumbnail}
                    alt={media.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                  
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur border border-white/20">
                      {media.type === "video" ? "🎬 VIDÉO" : "🖼️ PHOTO"}
                    </span>
                  </div>

                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur border border-white/20 flex items-center justify-center text-[10px] font-mono">
                    {idx + 1}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <div className="text-[11px] font-medium truncate text-white/90">{media.filename}</div>
                    <div className="flex gap-1 mt-1.5">
                      <button
                        onClick={() => handleSingleDownload(media)}
                        className="flex-1 py-1 rounded-lg bg-white text-black text-[11px] font-bold hover:bg-white/90 transition-colors"
                      >
                        Télécharger
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {result.total > 100 && (
              <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 text-center text-sm text-white/60">
                ⚡ Limite de 100 médias par téléchargement pour éviter les abus. Profil complet contient {result.total} médias. 
                <br />Relancez avec un filtre plus précis ou contactez-nous pour débloquer plus.
              </div>
            )}
          </div>
        )}

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-20 grid md:grid-cols-2 gap-6 text-sm">
          <div className="space-y-4">
            <h3 className="font-bold text-lg">✨ Fonctionnalités uniques</h3>
            <ul className="space-y-2 text-white/60">
              <li className="flex gap-2"><span className="text-green-400">✓</span> Téléchargement de profil complet (50-100 médias en 1 clic)</li>
              <li className="flex gap-2"><span className="text-green-400">✓</span> Sans filigrane TikTok, Instagram HD original</li>
              <li className="flex gap-2"><span className="text-green-400">✓</span> Compteur animé en temps réel + progression</li>
              <li className="flex gap-2"><span className="text-green-400">✓</span> ZIP automatique avec noms de fichiers propres</li>
              <li className="flex gap-2"><span className="text-green-400">✓</span> Support 6 plateformes</li>
              <li className="flex gap-2"><span className="text-green-400">✓</span> 100% anonyme, pas de compte requis</li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-lg">🛡️ Sécurité & Légal</h3>
            <ul className="space-y-2 text-white/60">
              <li className="flex gap-2"><span className="text-blue-400">•</span> Uniquement contenus publics</li>
              <li className="flex gap-2"><span className="text-blue-400">•</span> Pas de stockage serveur, tout en RAM</li>
              <li className="flex gap-2"><span className="text-blue-400">•</span> Rate limiting anti-abus (10 req/min)</li>
              <li className="flex gap-2"><span className="text-blue-400">•</span> Respect du droit d&apos;auteur - usage personnel uniquement</li>
              <li className="flex gap-2"><span className="text-blue-400">•</span> Pas de contournement de protection privée</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 mt-auto">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between gap-4 text-sm text-white/40">
            <div>
              <div className="font-bold text-white/80">SaveGram © 2025</div>
              <div className="mt-1 max-w-md">
                Outil indépendant non affilié à Instagram, TikTok, YouTube, Meta, X. Toutes les marques appartiennent à leurs propriétaires.
                Utilisez uniquement pour contenus dont vous avez les droits ou avec permission.
              </div>
            </div>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white/80">Confidentialité</a>
              <a href="#" className="hover:text-white/80">CGU</a>
              <a href="#" className="hover:text-white/80">Contact</a>
              <a href="https://github.com/cmd-josenhm/save" target="_blank" className="hover:text-white/80">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
