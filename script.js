const campo = document.getElementById("nuevaTarea");
const boton = document.getElementById("agregar");
const lista = document.getElementById("listaTareas");

let tareas = [];

function agregar() {

    let texto = campo.value.trim();

    if (texto === "") {
        alert("Escribe una tarea primero");
        return;
    }

    if (texto.length > 250) {
        alert("Máximo 250 caracteres");
        return;
    }

    let tarea = {
        texto: texto,
        completada: false
    };

    tareas.push(tarea);

    guardarTareas();
    cargarTareas();

    campo.value = "";
}

function cargarTareas() {

    lista.innerHTML = "";

    tareas.forEach((tarea, indice) => {

        let elemento = document.createElement("li");

        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = tarea.completada;

        let texto = document.createElement("span");
        texto.textContent = tarea.texto;

        if (tarea.completada) {
            texto.classList.add("completada");
        }

        checkbox.addEventListener("change", function() {

            tareas[indice].completada = checkbox.checked;

            guardarTareas();
            cargarTareas();

        });

        let eliminar = document.createElement("button");
        eliminar.textContent = "X";
        eliminar.classList.add("eliminar");

        eliminar.addEventListener("click", function() {

            tareas.splice(indice, 1);

            guardarTareas();
            cargarTareas();

        });

        elemento.appendChild(checkbox);
        elemento.appendChild(texto);
        elemento.appendChild(eliminar);

        lista.appendChild(elemento);

    });
}

function guardarTareas() {

    localStorage.setItem("misTareas", JSON.stringify(tareas));

}

function recuperarTareas() {

    let guardadas = localStorage.getItem("misTareas");

    if (guardadas !== null) {
        tareas = JSON.parse(guardadas);
    }

    cargarTareas();

}

boton.addEventListener("click", agregar);

campo.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        agregar();
    }

});

recuperarTareas();

/* ---------- PWA: instalar en el escritorio y funcionar sin conexión ---------- */

const botonInstalar = document.getElementById("instalarApp");
const estadoInstalacion = document.getElementById("estadoInstalacion");

const esAppInstalada =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

let eventoInstalacion = null;

if (esAppInstalada) {
    estadoInstalacion.textContent =
        "Estás usando la app instalada. Tus tareas se guardan en este dispositivo.";
}

window.addEventListener("beforeinstallprompt", function (evento) {
    evento.preventDefault();      // evita el aviso automático del navegador
    eventoInstalacion = evento;   // se usa cuando la persona haga clic en el botón

    if (!esAppInstalada) {
        botonInstalar.hidden = false;
    }
});

botonInstalar.addEventListener("click", async function () {
    if (!eventoInstalacion) return;

    botonInstalar.hidden = true;
    await eventoInstalacion.prompt();

    const resultado = await eventoInstalacion.userChoice;
    if (resultado.outcome !== "accepted") {
        botonInstalar.hidden = false;
    }

    eventoInstalacion = null;
});

window.addEventListener("appinstalled", function () {
    botonInstalar.hidden = true;
    estadoInstalacion.textContent =
        "¡Listo! La app ya está en tu escritorio y funciona sin conexión.";
});

/* Atajo del icono de Windows: abre la app con el campo listo para escribir */
if (new URLSearchParams(window.location.search).get("accion") === "nueva") {
    campo.focus();
}

/* El service worker solo funciona en HTTPS o localhost (no en file://) */
if ("serviceWorker" in navigator &&
    (location.protocol === "https:" ||
     location.hostname === "localhost" ||
     location.hostname === "127.0.0.1")) {

    window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function (error) {
            console.warn("No se pudo activar el modo sin conexión:", error);
        });
    });
}
