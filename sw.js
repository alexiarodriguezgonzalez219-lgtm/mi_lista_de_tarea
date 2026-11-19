/* ==================================================================
   sw.js  —  versión 5 (con soporte Firebase + caché offline)
   · Sube a v5 para actualizar mi-lista-v4 con los nuevos archivos.
   · Incluye firebase-config.js en el APP_SHELL y cachea los módulos
     del SDK de Firebase (gstatic.com) para que abra incluso sin red.
================================================================== */

const VERSION = "6";
const PREFIJO = "mi-lista-";
const CACHE = `${PREFIJO}v${VERSION}`;

/* Críticos: coinciden exacto con los archivos del repositorio. */
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./firebase-config.js",
    "./script.js",
    "./manifest.json"
];

/* Opcionales: si faltan solo se pierde el icono, no el offline. */
const EXTRA = [
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/favicon.ico"
];

async function limpiarRespuesta(respuesta) {
    if (!respuesta.redirected) return respuesta;
    const cuerpo = await respuesta.blob();
    return new Response(cuerpo, {
        status: respuesta.status,
        statusText: respuesta.statusText,
        headers: respuesta.headers
    });
}

async function cachear(cache, url, critico) {
    try {
        const respuesta = await fetch(url, { cache: "reload" });

        if (respuesta.status !== 200) {
            const aviso = `[sw] ${url} -> HTTP ${respuesta.status}`;
            critico ? console.error(aviso) : console.info(aviso);
            return;
        }

        const limpia = await limpiarRespuesta(respuesta);
        await cache.put(url, limpia);
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
            console.error("[sw] CRÍTICO: index.html no está en el caché.");
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

    const url = new URL(peticion.url);

    // Cachear los módulos estáticos del SDK de Firebase (gstatic.com) para que carguen offline
    if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
        evento.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const guardado = await cache.match(peticion);
            if (guardado) return guardado;

            try {
                const red = await fetch(peticion);
                if (red && red.status === 200) {
                    await cache.put(peticion, red.clone());
                }
                return red;
            } catch (_) {
                return new Response("", { status: 504, statusText: "SDK sin conexión" });
            }
        })());
        return;
    }

    // No interceptar llamadas en vivo a las APIs de Firebase Auth / Firestore
    if (url.origin !== self.location.origin) return;

    // 1. Navegación (abrir o recargar la página)
    if (peticion.mode === "navigate") {
        evento.respondWith((async () => {
            const cache = await caches.open(CACHE);

            try {
                const red = await fetch(peticion);

                if (red && red.status === 200) {
                    const limpia = await limpiarRespuesta(red.clone());
                    await cache.put("./index.html", limpia.clone());
                    await cache.put("./", limpia);
                }
                return red;
            } catch (_) {
                const shell =
                    (await cache.match("./index.html")) ||
                    (await cache.match("./")) ||
                    (await cache.match(peticion, { ignoreSearch: true }));

                if (shell) return shell;

                return new Response(
                    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
                     <meta name="viewport" content="width=device-width,initial-scale=1">
                     <title>Sin conexión</title></head>
                     <body style="font-family:system-ui;padding:2rem;line-height:1.6">
                     <h1>Sin conexión</h1>
                     <p>Conéctate una vez a internet para guardar la aplicación en este dispositivo.</p>
                     </body></html>`,
                    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
                );
            }
        })());
        return;
    }

    // 2. Recursos propios (style.css, firebase-config.js, script.js, manifest.json, iconos)
    evento.respondWith((async () => {
        const cache = await caches.open(CACHE);

        try {
            const red = await fetch(peticion, { cache: "no-cache" });
            if (red && red.status === 200) {
                const limpia = await limpiarRespuesta(red.clone());
                await cache.put(peticion, limpia);
            }
            return red;
        } catch (_) {
            const guardado =
                (await cache.match(peticion)) ||
                (await cache.match(peticion, { ignoreSearch: true }));

            return guardado || new Response("", { status: 504, statusText: "Sin conexión" });
        }
    })());
});
