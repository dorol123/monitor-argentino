# Monitor Argentino

Monitor en tiempo (casi) real de **Obligaciones Negociables (ONs)** argentinas: cotizaciones que se actualizan cada ~20 segundos, gratis, sin necesidad de cuenta de broker ni API key.

## Cómo funciona

- El backend (`server.js`, Express) consulta el endpoint público de [data912](https://data912.com) `/live/arg_corp`, que expone el panel de deuda corporativa argentina y se refresca cada ~20 segundos.
- Cachea la respuesta 20 segundos para no golpear data912 en cada request de cada usuario y respetar su límite de ~120 req/min.
- El frontend (`public/`) es una página estática sin build step: consulta `/api/ons` cada 20 segundos y muestra una tabla con precio, variación %, compra/venta y volumen.
- Tu lista de seguimiento (⭐) se guarda en `localStorage` del navegador — no hay backend de usuarios.
- El acceso a la página está protegido con una clave simple (cookie firmada), ver `SITE_PASSWORD` más abajo.

**Importante:** data912 es una fuente pública no oficial, pensada para uso educativo/hobby. No la uses como única fuente para decisiones de inversión.

## Histórico (opcional, Turso)

Si configurás `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`, el servidor arranca un poller interno que:

- Guarda una foto de todas las ONs **cada 20 segundos** en la tabla `snapshots`, con **retención de 48 horas** (se poda automáticamente lo más viejo).
- Guarda una foto **3 veces por día** (11:00, 14:00 y 17:00, hora Argentina) en `snapshots_daily`, sin límite de retención — pensada para ver evolución de mediano/largo plazo.
- Expone `GET /api/history/:symbol` (requiere estar logueado) — `?range=monthly` para la serie de largo plazo, sin parámetro para las últimas 48hs.

Sin esas dos variables de entorno, el histórico queda deshabilitado pero el resto de la app (cotizaciones en vivo) funciona igual.

**Ojo con Render free:** el poller solo corre mientras el proceso está vivo. Si el servicio se duerme por inactividad (ver nota más abajo), no se guardan snapshots durante ese lapso. Para minimizar cortes, configurá un ping externo gratuito (por ejemplo [cron-job.org](https://cron-job.org) o UptimeRobot) que pegue cada 10 minutos a `https://tu-app.onrender.com/healthz` (no requiere login) para mantenerlo despierto.

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
- `SITE_PASSWORD` (opcional, default `000`)
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` (opcionales, activan el histórico)

## Estructura

```
server.js        # Express: proxy/cache de data912, gate de acceso, poller de histórico, estáticos
db.js            # cliente Turso: init de tablas, insert, prune, consulta de histórico
login.html       # página de acceso con clave
public/
  index.html
  styles.css
  app.js          # fetch, tabla, sorting, búsqueda, watchlist en localStorage
```
