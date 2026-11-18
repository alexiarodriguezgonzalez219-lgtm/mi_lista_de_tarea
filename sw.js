const VERSION = "2";
const PREFIJO = "mi-lista-";           // para borrar solo NUESTRAS cachés
const CACHE = `${PREFIJO}v${VERSION}`;

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json"
];

/* ---------- INSTALL ---------- */
self.addEventListener("install", (evento) => {
    evento.waitUntil((async () => {
        const cache = await caches.open(CACHE);

        // addAll() es atómico: si UN archivo da 404, no se cachea NINGUNO.
        // Aquí se cachea uno por uno y se informa cuál falló.
        await Promise.all(APP_SHELL.map(async (url) => {
            try {
                const respuesta = await fetch(url, { cache: "reload" });
                if (!respuesta.ok) {
                    console.error(`[sw] ${url} -> HTTP ${respuesta.status}. Revisa la ruta y el nombre del archivo.`);
                    return;
                }
                await cache.put(url, respuesta);
            } catch (error) {
                console.error(`[sw] No se pudo precachear ${url}:`, error);
            }
        }));

        const shell = await cache.match("./index.html") || await cache.match("./");
        if (!shell) {
            console.error("[sw] CRÍTICO: index.html no está en el caché. El modo sin conexión no funcionará.");
        }

        await self.skipWaiting();
    })());
});

/* ---------- ACTIVATE ---------- */
self.addEventListener("activate", (evento) => {
    evento.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(
            nombres
                // Solo cachés propias y antiguas: no borrar las de otras apps del dominio.
                .filter((nombre) => nombre.startsWith(PREFIJO) && nombre !== CACHE)
                .map((nombre) => caches.delete(nombre))
        );
        await self.clients.claim();
    })());
});

/* ---------- FETCH ---------- */
self.addEventListener("fetch", (evento) => {
    const peticion = evento.request;

    if (peticion.method !== "GET") return;
    if (new URL(peticion.url).origin !== self.location.origin) return;

    /* Navegación: red primero, caché como respaldo.
       El fallback devuelve SIEMPRE una Response válida. */
    if (peticion.mode === "navigate") {
        evento.respondWith((async () => {
            try {
                const red = await fetch(peticion);
                if (red && red.ok) {
                    const cache = await caches.open(CACHE);
                    cache.put("./index.html", red.clone());
                }
                return red;
            } catch (_) {
                const cache = await caches.open(CACHE);
                const shell = await cache.match("./index.html") || await cache.match("./");
                if (shell) return shell;

                return new Response(
                    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
                     <meta name="viewport" content="width=device-width,initial-scale=1">
                     <title>Sin conexión</title></head>
                     <body style="font-family:system-ui;padding:2rem;line-height:1.5">
                     <h1>Sin conexión</h1>
                     <p>No hay red y la copia local de la app no está disponible en este dispositivo.</p>
                     <p>Tus tareas siguen guardadas en el navegador: no se han perdido.</p>
                     <p>Conéctate a internet una vez y la app volverá a quedar disponible sin conexión.</p>
                     </body></html>`,
                    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
                );
            }
        })());
        return;
    }

    /* Assets: sirve del caché y revalida en segundo plano. */
    evento.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const guardado = await cache.match(peticion);

        const red = fetch(peticion)
            .then((respuesta) => {
                // Nunca cachear errores: un 404 cacheado se sirve para siempre.
                if (respuesta && respuesta.ok) cache.put(peticion, respuesta.clone());
                return respuesta;
            })
            .catch(() => null);

        if (guardado) return guardado;

        const respuesta = await red;
        return respuesta || new Response("", { status: 504, statusText: "Sin conexión" });
    })());
});
