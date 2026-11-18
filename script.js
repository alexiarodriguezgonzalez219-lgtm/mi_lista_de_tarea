/* ------------------------------------------------------------------
   script.js — versión corregida con soporte de Ctrl+Shift+R offline
------------------------------------------------------------------- */

const CLAVE = "misTareas";

let tareas = [];

/* Intercepta Ctrl+Shift+R / Ctrl+F5 / Shift+F5 para que la recarga pase
   por sw.js (caché offline) y no dispare el error de red del navegador. */
window.addEventListener(
    "keydown",
    (evento) => {
        const esTeclaR =
            evento.code === "KeyR" ||
            (typeof evento.key === "string" && evento.key.toLowerCase() === "r");

        const esCtrlShiftR =
            (evento.ctrlKey || evento.metaKey) &&
            evento.shiftKey &&
            !evento.altKey &&
            esTeclaR;

        const esF5Forzado =
            (evento.ctrlKey || evento.shiftKey) &&
            !evento.altKey &&
            evento.key === "F5";

        if (!esCtrlShiftR && !esF5Forzado) return;

        const soportaSW =
            "serviceWorker" in navigator &&
            (location.protocol === "https:" ||
                location.hostname === "localhost" ||
                location.hostname === "127.0.0.1");

        if (!soportaSW) return;

        evento.preventDefault();
        evento.stopPropagation();

        if (!navigator.onLine) {
            window.location.reload();
            return;
        }

        navigator.serviceWorker
            .getRegistration()
            .then((reg) => (reg ? reg.update().catch(() => {}) : undefined))
            .finally(() => window.location.reload());
    },
    true
);

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

        if (!crudo) {
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

            tareas = parseado
                .filter((t) => t && typeof t.texto === "string")
                .map((t) => ({ texto: t.texto, completada: t.completada === true }));

        } catch (error) {
            console.error("No se pudo leer el JSON guardado, se empieza vacío:", error);
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

    function mostrarEstadoRed() {
        if (!estadoInstalacion) return;

        if (!navigator.onLine) {
            estadoInstalacion.textContent =
                "Sin conexión. Puedes seguir usando la app: tus tareas están guardadas en este dispositivo.";
        } else if (esAppInstalada) {
            estadoInstalacion.textContent =
                "Estás usando la app instalada. Tus tareas se guardan en este dispositivo.";
        } else {
            estadoInstalacion.textContent = "";
        }
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

    window.addEventListener("online", mostrarEstadoRed);
    window.addEventListener("offline", mostrarEstadoRed);

    /* ---------- Arranque ---------- */

    recuperarTareas();
    cargarTareas();
    mostrarEstadoRed();

    if (new URLSearchParams(window.location.search).get("accion") === "nueva") {
        campo.focus();
    }

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
                navigator.serviceWorker.addEventListener("controllerchange", pintarControl);

                registro.addEventListener("updatefound", () => {
                    const nuevo = registro.installing;
                    if (!nuevo) return;
                    nuevo.addEventListener("statechange", () => {
                        if (nuevo.state === "activated") pintarControl();
                    });
                });
            })
            .catch((error) => {
                console.warn("No se pudo activar el modo sin conexión:", error);
                marcarOffline("No se pudo activar el modo sin conexión: " + error.message);
            });
    }
});
