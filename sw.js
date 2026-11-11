/* Service worker: guarda la app en caché para que la versión instalada
   en el escritorio de Windows funcione también sin conexión. */

const CACHE = "mis-tareas-v1";

const RECURSOS = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-192.png",
    "./icons/icon-maskable-512.png",
    "./icons/favicon-32.png",
    "./icons/apple-touch-icon.png",
    "./icons/mstile-150x150.png",
    "./screenshots/pantalla-escritorio.png",
    "./screenshots/pantalla-movil.png"
];

self.addEventListener("install", function (evento) {
    evento.waitUntil(
        caches.open(CACHE)
            .then(function (cache) { return cache.addAll(RECURSOS); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener("activate", function (evento) {
    evento.waitUntil(
        caches.keys()
            .then(function (nombres) {
                return Promise.all(
                    nombres
                        .filter(function (nombre) { return nombre !== CACHE; })
                        .map(function (nombre) { return caches.delete(nombre); })
                );
            })
            .then(function () { return self.clients.claim(); })
    );
});

self.addEventListener("fetch", function (evento) {
    const peticion = evento.request;

    if (peticion.method !== "GET") return;
    if (new URL(peticion.url).origin !== self.location.origin) return;

    evento.respondWith(
        caches.match(peticion).then(function (guardada) {
            if (guardada) {
                // Actualiza la caché en segundo plano (stale while revalidate).
                fetch(peticion)
                    .then(function (nueva) {
                        if (nueva && nueva.ok) {
                            const copia = nueva.clone();
                            caches.open(CACHE).then(function (cache) {
                                return cache.put(peticion, copia);
                            });
                        }
                    })
                    .catch(function () { /* sin conexión: se usa la caché */ });
                return guardada;
            }

            return fetch(peticion)
                .then(function (nueva) {
                    if (nueva && nueva.ok) {
                        const copia = nueva.clone();
                        caches.open(CACHE).then(function (cache) {
                            return cache.put(peticion, copia);
                        });
                    }
                    return nueva;
                })
                .catch(function () {
                    if (peticion.mode === "navigate") {
                        return caches.match("./index.html");
                    }
                    return new Response("Sin conexión", { status: 503 });
                });
        })
    );
});
