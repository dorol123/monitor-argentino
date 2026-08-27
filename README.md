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

## Deploy

Cualquier plataforma que corra Node sirve (Railway, Render, Fly.io, etc). Variables de entorno:

- `PORT` (opcional, default 3000)

## Estructura

```
server.js        # Express: proxy/cache de data912 + estáticos
public/
  index.html
  styles.css
  app.js          # fetch, tabla, sorting, búsqueda, watchlist en localStorage
```
