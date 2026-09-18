"use client";

type Props = {
  platform: string;
  size?: "sm" | "md";
};

const platformConfig: Record<string, { icon: string; color: string; name: string }> = {
  instagram: { icon: "📸", color: "from-purple-500 to-pink-500", name: "Instagram" },
  tiktok: { icon: "🎵", color: "from-black to-gray-800", name: "TikTok" },
  youtube: { icon: "▶️", color: "from-red-500 to-red-700", name: "YouTube" },
  facebook: { icon: "👍", color: "from-blue-600 to-blue-800", name: "Facebook" },
  twitter: { icon: "🐦", color: "from-sky-400 to-blue-500", name: "Twitter" },
  pinterest: { icon: "📌", color: "from-red-600 to-red-800", name: "Pinterest" },
};

export default function PlatformBadge({ platform, size = "sm" }: Props) {
  const config = platformConfig[platform] || { icon: "🔗", color: "from-gray-600 to-gray-800", name: platform };
  
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${config.color} ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} font-medium text-white shadow`}>
      <span>{config.icon}</span>
      {config.name}
    </span>
  );
}
