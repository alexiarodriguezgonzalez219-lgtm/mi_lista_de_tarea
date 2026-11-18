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

    /* Aviso honesto de conectividad: informativo, NUNCA bloquea el arranque.
       Éste es el error clásico que deja la app inservible sin red. */
    function mostrarEstadoRed() {
        if (!estadoInstalacion) return;
        if (navigator.onLine) return;
        estadoInstalacion.textContent =
            "Sin conexión. Puedes seguir usando la app: tus tareas están guardadas en este dispositivo.";
    }

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

    if ("serviceWorker" in navigator &&
        (location.protocol === "https:" ||
         location.hostname === "localhost" ||
         location.hostname === "127.0.0.1")) {

        window.addEventListener("load", () => {
            navigator.serviceWorker
                .register("./sw.js", { updateViaCache: "none" })
                .catch((error) => {
                    console.warn("No se pudo activar el modo sin conexión:", error);
                });
        });
    }
});
