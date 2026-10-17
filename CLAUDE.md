# Guardrails de Cancha

Reglas de seguridad para este monorepo. La web (Svelte) solo lee datos de tenis. La API (Node) es el único componente que habla con RapidAPI.

## Secretos

- `RAPIDAPI_KEY` y la clave de Claude (`CALUDE_API_KEY`, `CLAUDE_API_KEY` o `ANTHROPIC_API_KEY`) viven solo en `.env` local o en las variables de entorno de Render. Nunca en código, tests, fixtures, `render.yaml`, ni en variables `VITE_`.
- No leas `.env` para copiar la clave a un chat, un log, un comando o un archivo commiteable. Comprueba la conexión por el resultado (`200`, conteo), no imprimiendo el secreto.
- Si la clave aparece en una captura, un diff o un log, hay que rotarla en RapidAPI. No la reutilices.
- `.env`, `.env.local` y `*.local` siguen en `.gitignore`. No los fuerces en un commit.

## Límite de la API

- El navegador solo llama a `/api` y `/health` del mismo origen. No añadas la clave en el cliente ni un proxy genérico que reenvíe URLs elegidas por el usuario.
- `rapidGet` solo puede armar rutas bajo `https://${RAPIDAPI_HOST}`. El host por defecto es `tennisapi1.p.rapidapi.com`. No aceptes un host o una URL completa desde el query string.
- Valida antes de llamar a TennisApi: fechas `YYYY-MM-DD`, ids numéricos, búsqueda de 2 a 40 caracteres, y circuitos `atp`, `wta`, `atp-live`, `wta-live`.
- Mantén la caché en memoria y el límite por IP. No dispares un abanico de categorías sin tope ni concurrencia baja: gasta la cuota y facilita abuso del proxy.
- Las respuestas de `/api` llevan `Cache-Control: no-store`. No caches la clave ni cuerpos de error crudos de RapidAPI.
- Al cliente devuelve un mensaje corto. No reenvíes headers, el cuerpo completo ni el status interno si eso filtra la clave o detalle de infraestructura.

## Datos y superficie

- Este proyecto muestra marcador, rankings, cuotas referenciales y un pronóstico. El pronóstico es una estimación de Claude a partir de esos datos; no lo presentes como resultado seguro. No agregues registro de usuarios, pagos, apuestas, ni guardes datos personales.
- No registres cuerpos de petición que puedan contener la clave. El log de arranque solo dice si RapidAPI está configurado.
- CORS abierto (`*`) no es el modo de despliegue. En Render la web y la API comparten origen. Si `CORS_ORIGIN` hace falta, limítalo a orígenes concretos.
- Dependencias nuevas solo si hacen falta. No añadas paquetes que envíen telemetría con el entorno, ni desactives `npm audit` para ocultar avisos.

## Qué no hacer en un cambio

- No pegues secretos en ejemplos de `curl`, issues o el README. `.env.example` solo lleva `RAPIDAPI_KEY=` vacío.
- No conviertas un endpoint de lectura en uno que acepte métodos que escriban en TennisApi.
- No subas `node_modules` ni `apps/web/dist` como fuente de la clave: el build del cliente no debe contenerla. Si un grep la encuentra fuera de `.env`, trátala como filtración.
