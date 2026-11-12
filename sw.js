const CACHE = "mi-lista-v2";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS))
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();

        caches.open(CACHE).then((cache) => {
          cache.put(event.request, copia);
        });

        return respuesta;
      })
      .catch(async () => {
        const guardada = await caches.match(event.request);
        return guardada || caches.match("./index.html");
      })
  );
});
