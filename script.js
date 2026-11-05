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
