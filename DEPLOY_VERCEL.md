# Déploiement Vercel - SaveGram

## 🚀 Déploiement en 1 clic

### Option 1 : Via Vercel Dashboard (Recommandé)

1. **Connecte ton GitHub à Vercel**
   - Va sur https://vercel.com/new
   - Importe `cmd-josenhm/save`
   - Branche : `main`

2. **Configuration automatique détectée**
   - Framework : Next.js
   - Build Command : `npm run build`
   - Output Directory : `.next`
   - Install Command : `npm install`

3. **Variables d'environnement (optionnel)**
   ```
   # Pour vrai scraping Instagram (optionnel, sinon mode démo)
   INSTAGRAM_SESSION_ID=ton_session_id_instagram
   INSTAGRAM_CSRF_TOKEN=...
   ```

4. **Deploy** → Vercel build et déploie automatiquement
   - URL : `https://save-xxx.vercel.app`

### Option 2 : Via CLI

```bash
npm i -g vercel
cd /home/user/save
vercel --prod

# Suivre les étapes:
# - Link to existing project? No
# - Project name: savegram
# - Directory: ./
# - Override settings? No
```

### Option 3 : Via GitHub Action (auto-deploy)

Déjà configuré : chaque push sur `main` déclenche un déploiement Vercel automatique si tu as connecté le repo dans Vercel Dashboard.

## 🔧 Configuration Vercel (vercel.json)

```json
{
  "framework": "nextjs",
  "functions": {
    "app/api/extract/route.ts": { "maxDuration": 60 },
    "app/api/proxy/route.ts": { "maxDuration": 30 }
  }
}
```

- `maxDuration: 60s` nécessaire pour extraction (Hobby = 10s, Pro = 60s)
- Si Hobby, le bulk download fonctionne quand même car ZIP est côté client

## 🌐 Pourquoi client-side ZIP ?

Vercel serverless a des limites :
- Pas de stockage disque persistant
- Timeout 10s (Hobby) / 60s (Pro)
- Pas de Python natif pour yt-dlp

**Solution implémentée :**
- `/api/extract` retourne seulement la LISTE des URLs (rapide, <2s)
- Frontend télécharge chaque média via `/api/proxy` avec concurrency 3
- JSZip crée le ZIP dans le navigateur
- Pas de timeout, pas de stockage serveur

En prod avec Vercel Pro + Python runtime, tu peux passer à server-side ZIP.

## 🔒 Sécurité en prod

Vercel ajoute automatiquement :
- HTTPS
- DDoS protection
- Edge network

Notre code ajoute :
- Rate limiting 10 req/min (in-memory, pour prod utiliser Upstash Redis)
- SSRF protection
- CSP headers
- CORS

Pour prod à grande échelle, ajoute :
```bash
# Upstash Redis pour rate limiting distribué
npm install @upstash/redis @upstash/ratelimit
```

## 📦 Variables d'environnement prod

Dans Vercel Dashboard → Settings → Environment Variables :

| Nom | Valeur | Requis |
|-----|--------|--------|
| `INSTAGRAM_SESSION_ID` | Session cookie Instagram | Non, mode démo sinon |
| `NODE_ENV` | `production` | Auto |

## 🧪 Test prod

```bash
curl -X POST https://ton-app.vercel.app/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/instagram/"}'
```

Doit retourner 200 avec liste médias.

## 🐛 Debug Vercel

- Logs : Vercel Dashboard → Deployments → Functions → Logs
- Si 500 sur /api/proxy : vérifier que picsum.photos est accessible depuis Vercel (oui)
- Si 429 : rate limit, attendre 1 min
- Si yt-dlp ENOENT : normal en Hobby, fallback mock activé. Pour vrai yt-dlp, utiliser Docker deployment ou API externe.

## 🔄 Pour vrai yt-dlp en prod (V2)

Option A : Vercel avec Python
- Créer `api/extract.py` avec yt-dlp Python lib
- Vercel supporte Python + Node simultanément

Option B : Service externe
- Déployer microservice Python sur Fly.io / Render
- Next.js appelle ce service

Option C : Docker sur Vercel (Pro)
- `vercel.json` avec `builds` docker

Pour MVP, le mode démo avec fallback est suffisant et fonctionnel.

## 📊 Monitoring

Ajoute dans Vercel :
- Analytics (gratuit)
- Speed Insights
- Web Vitals

## ✅ Checklist prod

- [x] Build passe (`npm run build`)
- [x] Security headers présents
- [x] Rate limiting actif
- [x] SSRF protection testée
- [x] Proxy valide content-type
- [x] Limite 100 médias
- [x] Disclaimer légal footer
- [x] Responsive mobile
- [x] Français
- [ ] Domaine custom (optionnel) : Vercel → Settings → Domains
- [ ] Env vars configurées

## 🌍 Domaine custom

Dans Vercel → Settings → Domains → Add `savegram.com`
- Configure DNS CNAME vers `cname.vercel-dns.com`

---

**Une fois déployé, partage l'URL Vercel pour test final.**
