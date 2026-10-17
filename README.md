# Cancha

Monorepo de tenis: agenda, marcador en vivo, rankings ATP/WTA y cuotas. El frontend es Svelte con Tailwind. La API de Node consulta [TennisApi](https://rapidapi.com/fluis.lacasse/api/tennisapi1) en RapidAPI y esconde la clave.

```
apps/api   Express. Proxy, caché y normalización de TennisApi
apps/web   Svelte 5 + Vite + Tailwind CSS 4
render.yaml  Blueprint para publicar ambos en un solo servicio de Render
```

La clave nunca viaja al navegador. El cliente solo llama a `/api/*` del mismo origen.

## Local

Requiere Node.js 20 o superior.

```bash
npm install
copy .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Edita `.env` y pega tu clave:

```
RAPIDAPI_KEY=tu_clave
```

```bash
npm run dev
```

Abre http://127.0.0.1:5173. Vite reenvía `/api` y `/health` al servidor en el puerto 8787.

```bash
npm test
npm run build
npm start
```

`npm start` sirve la web ya compilada y la API en el puerto 8787.

## Qué consulta

| Pantalla | TennisApi |
| --- | --- |
| Agenda | `GET /api/tennis/events/odds/{día}/{mes}/{año}` |
| Si ese feed no existe | `GET /api/tennis/events/{día}/{mes}/{año}` y, en último caso, categorías del calendario |
| En vivo | `GET /api/tennis/events/live` |
| Cuotas del partido | `GET /api/tennis/event/{id}/odds` (`getMatchBettingOdds`, bookmaker 1) |
| Rankings | `GET /api/tennis/rankings/atp` y `/wta`, más las variantes live |
| Búsqueda | `GET /api/tennis/search/{término}` |

Las respuestas se guardan en memoria unos segundos para no gastar la cuota de RapidAPI en cada refresco. La primera agenda del día puede tardar, porque TennisApi ya no entrega todos los partidos en una sola llamada: el servidor junta las categorías de ese día. Si el plan se queda sin cuota, la lista avisa que está incompleta.

## Render

1. Sube este repositorio a GitHub o GitLab.
2. En Render, crea un **Blueprint** y selecciona el repo. Render lee `render.yaml`.
3. Cuando pida `RAPIDAPI_KEY`, pega la clave de tu aplicación en RapidAPI. No la pongas en el código.
4. El build instala el monorepo, compila Svelte y arranca la API. La API sirve `apps/web/dist`.

El plan gratuito de Render se duerme tras un rato sin tráfico. La primera visita después de eso tarda más.

La clave que aparece en una captura de RapidAPI quedó expuesta. Rótala en el panel de RapidAPI y usa solo la nueva en `.env` y en Render.
