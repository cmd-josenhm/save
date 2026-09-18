import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaveGram - Téléchargeur Instagram, TikTok, YouTube sans filigrane",
  description: "Téléchargez vidéos et photos Instagram, TikTok, YouTube, Facebook, Twitter, Pinterest sans filigrane. Téléchargement de profil complet en un clic. Gratuit, rapide, anonyme.",
  keywords: ["instagram downloader", "tiktok sans filigrane", "télécharger reel", "savegram", "téléchargeur instagram", "download instagram photos"],
  authors: [{ name: "SaveGram" }],
  robots: "index, follow",
  openGraph: {
    title: "SaveGram - Téléchargeur Universel",
    description: "Téléchargez tout un profil Instagram/TikTok en 1 clic",
    type: "website",
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased bg-black text-white">
        {children}
      </body>
    </html>
  );
}
