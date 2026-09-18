# SaveGram - Téléchargeur Universel sans Filigrane

![SaveGram](https://img.shields.io/badge/SaveGram-v1.0.0-purple?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![Vercel](https://img.shields.io/badge/Vercel-Ready-black?style=flat-square&logo=vercel)

Site web complet type **SnapTik** mais avec fonctionnalité unique : **téléchargement de profil complet en 1 clic** avec compteur animé et ZIP automatique.

## 🚀 Fonctionnalités

### ✨ Unique - Bulk Profile Download
- Collez `https://instagram.com/username` → télécharge **tout le profil** (photos + vidéos + reels)
- Compteur animé en temps réel : `12/48 téléchargés`
- Barre de progression + ZIP automatique
- Limité à 100 médias max par requête (anti-abus)

### 📱 Plateformes supportées
- **Instagram** : Posts, Reels, Stories, Photos de profil, Carrousels
- **TikTok** : Vidéos sans filigrane, profils complets
- **YouTube** : Vidéos, Shorts, miniatures HD
- **Facebook** : Vidéos publiques, Reels
- **Twitter/X** : Vidéos, images
- **Pinterest** : Images HD, vidéos

### 🛡️ Sécurité (implémenté)
- ✅ Rate limiting 10 req/min par IP
- ✅ SSRF protection (domaines whitelist)
- ✅ Bloque IPs privées (localhost, 192.168, etc)
- ✅ Validation URL + sanitization filenames
- ✅ Pas de stockage serveur (RAM only)
- ✅ CSP, XSS, Clickjacking protections
- ✅ CORS configuré
- ✅ Limite 100 médias + 100MB par fichier
- ✅ Profils publics uniquement
- ✅ Middleware sécurité anti-injection

### 🎨 UI/UX
- Design moderne type SnapTik (glassmorphism, gradient)
- 100% responsive mobile
- Français par défaut
- Compteur animé + shimmer effects
- Galerie avec aperçu
- Téléchargement individuel ou ZIP complet

## 🏗️ Architecture

```
app/
├── page.tsx              # UI principale (client-side ZIP avec JSZip)
├── globals.css           # Tailwind + animations
├── layout.tsx            # SEO metadata
├── api/
│   ├── extract/route.ts  # Extraction médias (yt-dlp + fallback mock)
│   ├── proxy/route.ts    # Proxy anti-CORS pour téléchargement
│   └── download/route.ts # Job tracking (future)
└── components/           # Composants UI (extensible)

middleware.ts             # Sécurité globale
vercel.json               # Config Vercel (60s maxDuration)
next.config.js            # Headers sécurité
```

### Flux de téléchargement

1. **Input** : User colle lien → `detectPlatform()` + `isProfileUrl()`
2. **Extract API** : 
   - Valide domaine whitelist
   - Rate limit check
   - Tente `yt-dlp-exec` (vrai extraction)
   - Fallback mock si Instagram bloque (avec warning)
   - Retourne `{ medias[], profile, total, isProfile }`
3. **Frontend** :
   - Affiche galerie + compteur
   - Si profil → auto-start bulk download
   - Pour chaque média : `fetch(/api/proxy?url=...)` avec concurrency 3
   - Ajoute à JSZip folder
   - Progress bar + compteur `downloadedCount`
   - `zip.generateAsync()` → `saveAs(zip)`
4. **Confirmation** : Message succès + nom ZIP

## 🔧 Installation locale

```bash
npm install
npm run dev
# http://localhost:3000
```

## 🌐 Déploiement Vercel (Production)

### Option 1 : Via CLI
```bash
npm i -g vercel
vercel --prod
```

### Option 2 : Via GitHub
1. Push sur `main` → Vercel auto-déploie
2. Variables d'environnement (optionnel) :
   - `INSTAGRAM_SESSION_ID` : pour vrai scraping Instagram (cookies)
   - `YT_DLP_COOKIES` : cookies YouTube

### Config Vercel
- `vercel.json` déjà configuré avec `maxDuration: 60s`
- Framework : Next.js 14
- Build : `npm run build`
- Node 18+

### Limites Vercel
- Serverless : 10s (Hobby) / 60s (Pro) → on utilise client-side ZIP pour contourner
- Pas de stockage disque persistant → JSZip côté client
- yt-dlp nécessite Python → en prod, utiliser Docker ou API externe

## 🔒 Failles corrigées (audit)

| Faille | Risque | Fix |
|--------|--------|-----|
| SSRF | Accès localhost / AWS metadata | Whitelist domaines + bloque IP privées |
| XSS | Injection via filename | `sanitizeFilename()` + CSP |
| Path Traversal | `../../etc/passwd` | Middleware bloque `../` |
| DoS | Flood API | Rate limiting 10/min + limite 100 médias |
| CORS | Vol de données | Proxy valide content-type image/video only |
| Open Redirect | Phishing | Validation URL stricte |
| Zip Bomb | Crash client | Limite 100MB par fichier |
| Clickjacking | Iframe malveillant | `X-Frame-Options: DENY` |

## ⚠️ Légal & Éthique

- **Uniquement profils publics** - pas de contournement privé
- **Usage personnel uniquement** - respect droit d'auteur
- **Non affilié** à Instagram, TikTok, Meta, Google
- **Disclaimer** dans footer + warning API
- **Pas de stockage** - tout est temporaire
- L'utilisateur est responsable de respecter les CGU des plateformes

## 🧪 Tests

```bash
# Test manuel
curl -X POST http://localhost:3000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/instagram/"}'

# Test sécurité SSRF (doit échouer)
curl -X POST http://localhost:3000/api/extract \
  -d '{"url":"http://localhost:3000"}' # 400 Domaine non autorisé

# Test rate limit (11 requêtes rapides = 429)
for i in {1..11}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/extract -H "Content-Type: application/json" -d '{"url":"https://instagram.com/test"}'; done
```

## 📦 Dépendances

- `next 14.2.5` - Framework
- `jszip 3.10.1` - ZIP client-side
- `file-saver 2.0.5` - Save file
- `yt-dlp-exec 1.0.3` - Extraction (optionnel, fallback mock)
- `tailwindcss 3.4.6` - Styling

## 🚀 Roadmap

- [ ] V2 : Auth Instagram via cookies (vrai bulk)
- [ ] V2 : Queue system avec Upstash Redis + BullMQ
- [ ] V2 : WebSocket pour progression temps réel serveur
- [ ] V2 : Preview vidéo avant download
- [ ] V2 : API key pour devs

## 📄 Licence

MIT - Usage éducatif. Respectez les CGU des plateformes.

---

**Auteur** : SaveGram Team  
**Repo** : https://github.com/cmd-josenhm/save  
**Démo** : https://savegram.vercel.app (à déployer)
