/* ==================================================================
   sw.js  —  versión 3
   · No se cachean respuestas REDIRIGIDAS (cache.put lanza TypeError y
     rompía el guardado del shell en GitHub Pages).
   · El precaché crítico y el opcional están separados.
   · Se registra en consola qué archivo falta, con su URL completa.
================================================================== */

const VERSION = "3";
const PREFIJO = "mi-lista-";
const CACHE = `${PREFIJO}v${VERSION}`;

/* Críticos: si falta uno, el modo sin conexión queda cojo. */
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json"
];

/* Opcionales: si faltan solo se pierde el icono, no el offline. */
const EXTRA = [
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/favicon.ico"
];

async function cachear(cache, url, critico) {
    try {
        const respuesta = await fetch(url, { cache: "reload" });

        if (!respuesta.ok) {
            const aviso = `[sw] ${url} -> HTTP ${respuesta.status}`;
            critico ? console.error(aviso) : console.info(aviso);
            return;
        }

        // Una respuesta redirigida no se puede guardar con cache.put:
        // lanza TypeError. En GitHub Pages ocurre con /ruta -> /ruta/.
        if (respuesta.redirected) {
            console.info(`[sw] ${url} respondió con redirección; se omite del precaché.`);
            return;
        }

        await cache.put(url, respuesta);
    } catch (error) {
        critico
            ? console.error(`[sw] No se pudo precachear ${url}:`, error)
            : console.info(`[sw] Opcional no cacheado ${url}`);
    }
}

/* ---------- INSTALL ---------- */
self.addEventListener("install", (evento) => {
    evento.waitUntil((async () => {
        const cache = await caches.open(CACHE);

        await Promise.all(APP_SHELL.map((url) => cachear(cache, url, true)));
        await Promise.all(EXTRA.map((url) => cachear(cache, url, false)));

        const shell = (await cache.match("./index.html")) || (await cache.match("./"));
        if (!shell) {
            console.error(
                "[sw] CRÍTICO: index.html no está en el caché. " +
                "El modo sin conexión no funcionará. Revisa la ruta en APP_SHELL."
            );
        } else {
            console.info(`[sw] Listo: app cacheada en "${CACHE}".`);
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

    if (peticion.mode === "navigate") {
        evento.respondWith((async () => {
            try {
                const red = await fetch(peticion);

                if (red && red.ok && !red.redirected) {
                    const cache = await caches.open(CACHE);
                    cache.put("./index.html", red.clone());
                }
                return red;
            } catch (_) {
                const cache = await caches.open(CACHE);
                const shell = (await cache.match("./index.html")) || (await cache.match("./"));
                if (shell) return shell;

                return new Response(
                    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
                     <meta name="viewport" content="width=device-width,initial-scale=1">
                     <title>Sin conexión</title></head>
                     <body style="font-family:system-ui;padding:2rem;line-height:1.6">
                     <h1>Sin conexión</h1>
                     <p>No hay red y la copia local de la app no está disponible en este dispositivo.</p>
                     <p><strong>Tus tareas siguen guardadas en el navegador</strong>: no se han perdido.</p>
                     <p>Conéctate una vez y la app volverá a quedar disponible sin conexión.</p>
                     </body></html>`,
                    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
                );
            }
        })());
        return;
    }

    evento.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const guardado = await cache.match(peticion);

        const enRed = fetch(peticion)
            .then((respuesta) => {
                if (respuesta && respuesta.ok && !respuesta.redirected) {
                    cache.put(peticion, respuesta.clone());
                }
                return respuesta;
            })
            .catch(() => null);

        if (guardado) return guardado;

        const respuesta = await enRed;
        return respuesta || new Response("", { status: 504, statusText: "Sin conexión" });
    })());
});
