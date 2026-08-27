# Monitor Argentino

Monitor en tiempo (casi) real de **Obligaciones Negociables (ONs)** argentinas: cotizaciones que se actualizan cada ~20 segundos, gratis, sin necesidad de cuenta de broker ni API key.

## Cómo funciona

- El backend (`server.js`, Express) consulta el endpoint público de [data912](https://data912.com) `/live/arg_corp`, que expone el panel de deuda corporativa argentina y se refresca cada ~20 segundos.
- Cachea la respuesta 20 segundos para no golpear data912 en cada request de cada usuario y respetar su límite de ~120 req/min.
- El frontend (`public/`) es una página estática sin build step: consulta `/api/ons` cada 20 segundos y muestra una tabla con precio, variación %, compra/venta y volumen.
- Tu lista de seguimiento (⭐) se guarda en `localStorage` del navegador — no hay backend de usuarios ni base de datos.

**Importante:** data912 es una fuente pública no oficial, pensada para uso educativo/hobby. No la uses como única fuente para decisiones de inversión.

## Uso local

```bash
npm install
npm start
```

Abrí http://localhost:3000

## Deploy (Render, gratis)

1. Entrá a [render.com](https://render.com) y creá una cuenta (podés loguearte con GitHub).
2. **New +** → **Blueprint** → seleccioná el repo `monitor-argentino`. Render detecta `render.yaml` solo y configura todo (build `npm install`, start `npm start`, plan free).
   - Si preferís hacerlo a mano: **New +** → **Web Service** → elegí el repo → Runtime `Node` → Build Command `npm install` → Start Command `npm start` → Plan `Free`.
3. Deploy. Te da una URL tipo `https://monitor-argentino.onrender.com`.

**Nota sobre el plan free:** el servicio se "duerme" tras ~15 minutos sin tráfico. La primera visita después de eso tarda ~30-50s en responder mientras arranca de nuevo; después va normal. No hay forma de evitar esto en el plan gratuito.

Variables de entorno:

- `PORT` (la define Render automáticamente, no hace falta tocarla)

## Estructura

```
server.js        # Express: proxy/cache de data912 + estáticos
public/
  index.html
  styles.css
  app.js          # fetch, tabla, sorting, búsqueda, watchlist en localStorage
```
