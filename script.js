/* ------------------------------------------------------------------
   script.js — versión corregida
   1. Todo el arranque va dentro de DOMContentLoaded.
   2. Lectura/escritura de localStorage blindadas con try/catch.
   3. Render con delegación de eventos.
   4. Registro único del SW con updateViaCache: "none".
   5. Estado del modo sin conexión visible en la página.
------------------------------------------------------------------- */

const CLAVE = "misTareas";

let tareas = [];

document.addEventListener("DOMContentLoaded", () => {

    const campo = document.getElementById("nuevaTarea");
    const boton = document.getElementById("agregar");
    const lista = document.getElementById("listaTareas");

    /* ---------- Persistencia ---------- */

    function guardarTareas() {
        try {
            localStorage.setItem(CLAVE, JSON.stringify(tareas));
            return true;
        } catch (error) {
            console.error("No se pudieron guardar las tareas:", error);
            alert("No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado.");
            return false;
        }
    }

    function recuperarTareas() {
        let crudo = null;

        try {
            crudo = localStorage.getItem(CLAVE);
        } catch (error) {
            console.error("localStorage no disponible:", error);
            tareas = [];
            return;
        }

        if (!crudo) {           // null o cadena vacía
            tareas = [];
            return;
        }

        try {
            const parseado = JSON.parse(crudo);

            if (!Array.isArray(parseado)) {
                console.warn("El dato guardado no es un array, se descarta:", parseado);
                tareas = [];
                return;
            }

            // Saneado: descarta entradas con forma inesperada en vez de romper el render.
            tareas = parseado
                .filter((t) => t && typeof t.texto === "string")
                .map((t) => ({ texto: t.texto, completada: t.completada === true }));

        } catch (error) {
            console.error("No se pudo leer el JSON guardado, se empieza vacío:", error);
            // Se conserva una copia por si el usuario quiere recuperarla a mano.
            try { localStorage.setItem(CLAVE + "-respaldo", crudo); } catch (_) {}
            tareas = [];
        }
    }

    /* ---------- Render ---------- */

    function cargarTareas() {
        lista.innerHTML = "";

        if (tareas.length === 0) {
            const vacio = document.createElement("li");
            vacio.className = "vacio";
            vacio.textContent = "No hay tareas todavía.";
            lista.appendChild(vacio);
            return;
        }

        tareas.forEach((tarea, indice) => {
            const elemento = document.createElement("li");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = tarea.completada;
            checkbox.dataset.indice = indice;
            checkbox.dataset.accion = "alternar";

            const texto = document.createElement("span");
            texto.textContent = tarea.texto;
            if (tarea.completada) texto.classList.add("completada");

            const eliminar = document.createElement("button");
            eliminar.textContent = "X";
            eliminar.classList.add("eliminar");
            eliminar.dataset.indice = indice;
            eliminar.dataset.accion = "eliminar";

            elemento.append(checkbox, texto, eliminar);
            lista.appendChild(elemento);
        });
    }

    /* Delegación: un solo listener para todos los elementos, inmune a
       problemas de índices obsoletos tras un re-render. */
    lista.addEventListener("click", (evento) => {
        const objetivo = evento.target;
        const accion = objetivo.dataset && objetivo.dataset.accion;
        if (!accion) return;

        const indice = Number(objetivo.dataset.indice);
        if (!Number.isInteger(indice) || !tareas[indice]) return;

        if (accion === "eliminar") {
            tareas.splice(indice, 1);
            guardarTareas();
            cargarTareas();
        }
    });

    lista.addEventListener("change", (evento) => {
        const objetivo = evento.target;
        if (objetivo.dataset.accion !== "alternar") return;

        const indice = Number(objetivo.dataset.indice);
        if (!Number.isInteger(indice) || !tareas[indice]) return;

        tareas[indice].completada = objetivo.checked;
        guardarTareas();
        cargarTareas();
    });

    /* ---------- Alta ---------- */

    function agregar() {
        const valor = campo.value.trim();

        if (valor === "") {
            alert("Escribe una tarea primero");
            return;
        }

        if (valor.length > 250) {
            alert("Máximo 250 caracteres");
            return;
        }

        tareas.push({ texto: valor, completada: false });

        guardarTareas();
        cargarTareas();

        campo.value = "";
        campo.focus();
    }

    boton.addEventListener("click", agregar);

    campo.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") agregar();
    });

    /* ---------- PWA ---------- */

    const botonInstalar = document.getElementById("instalarApp");
    const estadoInstalacion = document.getElementById("estadoInstalacion");

    const esAppInstalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    let eventoInstalacion = null;

    if (esAppInstalada && estadoInstalacion) {
        estadoInstalacion.textContent =
            "Estás usando la app instalada. Tus tareas se guardan en este dispositivo.";
    }

    window.addEventListener("beforeinstallprompt", (evento) => {
        evento.preventDefault();
        eventoInstalacion = evento;
        if (!esAppInstalada && botonInstalar) botonInstalar.hidden = false;
    });

    if (botonInstalar) {
        botonInstalar.addEventListener("click", async () => {
            if (!eventoInstalacion) return;

            botonInstalar.hidden = true;
            await eventoInstalacion.prompt();

            const resultado = await eventoInstalacion.userChoice;
            if (resultado.outcome !== "accepted") botonInstalar.hidden = false;

            eventoInstalacion = null;
        });
    }

    window.addEventListener("appinstalled", () => {
        if (botonInstalar) botonInstalar.hidden = true;
        if (estadoInstalacion) {
            estadoInstalacion.textContent =
                "¡Listo! La app ya está en tu escritorio y funciona sin conexión.";
        }
    });

    /* Aviso honesto de conectividad: informativo, NUNCA bloquea el arranque. */
    function mostrarEstadoRed() {
        if (!estadoInstalacion) return;
        if (navigator.onLine) return;
        estadoInstalacion.textContent =
            "Sin conexión. Puedes seguir usando la app: tus tareas están guardadas en este dispositivo.";
    }

    window.addEventListener("online", mostrarEstadoRed);
    window.addEventListener("offline", mostrarEstadoRed);

    /* ---------- Arranque ---------- */

        /* ---------- Arranque ---------- */

    recuperarTareas();
    cargarTareas();
    mostrarEstadoRed();

    /* Intercepta Ctrl+Shift+R (y Ctrl+F5 / Shift+F5) para que sin internet
       recargue usando la caché del Service Worker en vez de dar error de red. */
    window.addEventListener(
        "keydown",
        (evento) => {
            const esTeclaR =
                evento.code === "KeyR" ||
                (typeof evento.key === "string" && evento.key.toLowerCase() === "r");

            const esRecargaForzada =
                !evento.altKey &&
                (((evento.ctrlKey || evento.metaKey) && evento.shiftKey && esTeclaR) ||
                    ((evento.ctrlKey || evento.shiftKey) && evento.key === "F5"));

            if (!esRecargaForzada) return;

            const soportaSW =
                "serviceWorker" in navigator &&
                (location.protocol === "https:" ||
                    location.hostname === "localhost" ||
                    location.hostname === "127.0.0.1");

            if (!soportaSW) return;

            evento.preventDefault();
            evento.stopPropagation();

            if (!navigator.onLine) {
                // Recarga normal: sw.js entrega la app desde caché y localStorage carga las tareas
                window.location.reload();
                return;
            }

            // Si sí hay internet, busca cambios en el SW y recarga
            navigator.serviceWorker
                .getRegistration()
                .then((reg) => (reg ? reg.update().catch(() => {}) : undefined))
                .finally(() => {
                    window.location.reload();
                });
        },
        true
    );

    /* ---------- Service worker ---------- */

    const estadoOffline = document.getElementById("estadoOffline");

    function marcarOffline(texto) {
        if (estadoOffline) estadoOffline.textContent = texto;
    }

    if (!("serviceWorker" in navigator)) {
        marcarOffline("Este navegador no soporta el modo sin conexión.");
    } else if (location.protocol !== "https:" &&
               location.hostname !== "localhost" &&
               location.hostname !== "127.0.0.1") {
        marcarOffline("El modo sin conexión requiere HTTPS (en file:// no funciona).");
    } else {
        navigator.serviceWorker
            .register("./sw.js", { updateViaCache: "none" })
            .then(async (registro) => {
                await navigator.serviceWorker.ready;

                const pintarControl = () => {
                    if (navigator.serviceWorker.controller) {
                        marcarOffline("Modo sin conexión activo: tus tareas se guardan en este dispositivo.");
                    } else {
                        marcarOffline("Preparando el modo sin conexión… recarga la página una vez.");
                    }
                };

                pintarControl();
                // En la primera visita el SW se activa y toma el control un instante
                // después; esto actualiza el texto sin obligar a recargar.
                navigator.serviceWorker.addEventListener("controllerchange", pintarControl);

                // Si llega una versión nueva del SW, avisar (sin recargar a la fuerza).
                registro.addEventListener("updatefound", () => {
                    marcarOffline("Actualizando la app… cierra y vuelve a abrir para aplicar los cambios.");
                });
            })
            .catch((error) => {
                console.warn("No se pudo activar el modo sin conexión:", error);
                marcarOffline("No se pudo activar el modo sin conexión: " + error.message);
            });
    }
});
