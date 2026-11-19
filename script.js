/* ==================================================================
   script.js — Sincronización en tiempo real con Firebase (Firestore + Auth)
   · Funciona en Celular + Computadora con la misma cuenta.
   · Conserva modo offline completo (IndexedDB de Firestore + localStorage).
   · Conserva soporte de recarga Ctrl+Shift+R offline y PWA instalable.
================================================================== */

const CLAVE_LOCAL = "misTareas";
const CLAVE_CONFIG_GUARDADA = "miFirebaseConfigPersonalizada";
const FIREBASE_SDK_VERSION = "11.0.2";

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

/* ---------- Utilidades para validar y extraer firebaseConfig ---------- */

function configEsValida(cfg) {
    if (!cfg || typeof cfg !== "object") return false;
    const apiKey = String(cfg.apiKey || "").trim();
    const projectId = String(cfg.projectId || "").trim();
    const authDomain = String(cfg.authDomain || "").trim();

    if (!apiKey || !projectId || !authDomain) return false;
    if (apiKey.includes("PEGA_AQUI") || projectId.includes("PEGA_AQUI")) return false;
    return true;
}

function obtenerConfigActiva() {
    // 1. Primero revisa si firebase-config.js ya tiene tus credenciales reales
    if (configEsValida(window.FIREBASE_CONFIG)) {
        return window.FIREBASE_CONFIG;
    }

    // 2. Si no, revisa si las pegaste desde el asistente de la pantalla
    try {
        const guardada = localStorage.getItem(CLAVE_CONFIG_GUARDADA);
        if (guardada) {
            const parseada = JSON.parse(guardada);
            if (configEsValida(parseada)) return parseada;
        }
    } catch (_) {}

    return null;
}

/* Convierte el bloque que copia el usuario desde Firebase Console
   (incluso si viene con "const firebaseConfig = { ... };") en un objeto JSON limpio */
function extraerConfigDeTexto(textoCrudo) {
    const inicio = textoCrudo.indexOf("{");
    const fin = textoCrudo.lastIndexOf("}");
    if (inicio === -1 || fin === -1 || fin <= inicio) {
        throw new Error("No se encontró el bloque { ... } de firebaseConfig.");
    }

    const bloque = textoCrudo.slice(inicio, fin + 1);
    const campos = [
        "apiKey",
        "authDomain",
        "projectId",
        "storageBucket",
        "messagingSenderId",
        "appId"
    ];

    const resultado = {};
    for (const campo of campos) {
        const regex = new RegExp(`["']?${campo}["']?\\s*:\\s*["']([^"']+)["']`);
        const coincidencia = bloque.match(regex);
        if (coincidencia && coincidencia[1]) {
            resultado[campo] = coincidencia[1].trim();
        }
    }

    if (!configEsValida(resultado)) {
        throw new Error(
            "Faltan datos obligatorios (apiKey, authDomain o projectId). Asegúrate de copiar todo el bloque firebaseConfig."
        );
    }

    return resultado;
}

function traducirErrorFirebase(error) {
    const codigo = (error && error.code) || "";
    switch (codigo) {
        case "auth/popup-closed-by-user":
            return "Cerraste la ventana de acceso antes de terminar.";
        case "auth/popup-blocked":
            return "El navegador bloqueó la ventana emergente. Permite ventanas emergentes o entra con correo y contraseña.";
        case "auth/unauthorized-domain":
            return "Falta autorizar este dominio en Firebase Console → Authentication → Settings → Dominios autorizados.";
        case "auth/operation-not-allowed":
            return "Activa este método de acceso en Firebase Console → Authentication → Sign-in method.";
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Correo o contraseña incorrectos (si eres nuevo, pulsa «Crear cuenta»).";
        case "auth/email-already-in-use":
            return "Ese correo ya tiene cuenta. Pulsa «Iniciar sesión».";
        case "auth/weak-password":
            return "La contraseña debe tener al menos 6 caracteres.";
        case "auth/invalid-email":
            return "Escribe un correo electrónico válido.";
        case "permission-denied":
            return "Permiso denegado en Firestore. Revisa que pegaste las Reglas de firestore.rules en Firebase Console.";
        default:
            return (error && error.message) || "Ocurrió un error inesperado al conectar con Firebase.";
    }
}

/* ---------- Aplicación principal ---------- */

document.addEventListener("DOMContentLoaded", async () => {
    const campo = document.getElementById("nuevaTarea");
    const boton = document.getElementById("agregar");
    const lista = document.getElementById("listaTareas");

    // Elementos de cuenta y sincronización
    const vistaSinConfig = document.getElementById("vistaSinConfig");
    const modalConfig = document.getElementById("modalConfig");
    const abrirConfigBtn = document.getElementById("abrirConfigBtn");
    const cambiarConfigBtn = document.getElementById("cambiarConfigBtn");
    const guardarConfigBtn = document.getElementById("guardarConfigBtn");
    const cancelarConfigBtn = document.getElementById("cancelarConfigBtn");
    const textoFirebaseConfig = document.getElementById("textoFirebaseConfig");
    const errorConfig = document.getElementById("errorConfig");

    const vistaLogin = document.getElementById("vistaLogin");
    const loginGoogleBtn = document.getElementById("loginGoogleBtn");
    const formCorreo = document.getElementById("formCorreo");
    const correoInput = document.getElementById("correoInput");
    const claveInput = document.getElementById("claveInput");
    const crearCuentaBtn = document.getElementById("crearCuentaBtn");
    const mensajeAuth = document.getElementById("mensajeAuth");

    const vistaConectado = document.getElementById("vistaConectado");
    const fotoUsuario = document.getElementById("fotoUsuario");
    const nombreUsuario = document.getElementById("nombreUsuario");
    const indicadorSync = document.getElementById("indicadorSync");
    const cerrarSesionBtn = document.getElementById("cerrarSesionBtn");

    const bannerMigracion = document.getElementById("bannerMigracion");
    const textoMigracion = document.getElementById("textoMigracion");
    const subirLocalesBtn = document.getElementById("subirLocalesBtn");
    const descartarMigracionBtn = document.getElementById("descartarMigracionBtn");

    let tareas = [];
    let usuarioActual = null;
    let cancelarSuscripcionNube = null;
    let fb = null; // Módulos e instancias de Firebase cuando están activos

    /* ---------- Respaldo local (cuando no hay sesión o sin configurar) ---------- */

    function guardarTareasLocales(arreglo = tareas) {
        try {
            localStorage.setItem(CLAVE_LOCAL, JSON.stringify(arreglo));
            return true;
        } catch (error) {
            console.error("No se pudieron guardar las tareas localmente:", error);
            return false;
        }
    }

    function leerTareasLocales() {
        let crudo = null;
        try {
            crudo = localStorage.getItem(CLAVE_LOCAL);
        } catch (_) {
            return [];
        }

        if (!crudo) return [];

        try {
            const parseado = JSON.parse(crudo);
            if (!Array.isArray(parseado)) return [];

            return parseado
                .filter((t) => t && typeof t.texto === "string")
                .map((t, idx) => ({
                    id: t.id || `local-${idx}-${Date.now()}`,
                    texto: t.texto,
                    completada: t.completada === true,
                    creadaEn: typeof t.creadaEn === "number" ? t.creadaEn : Date.now() + idx
                }));
        } catch (_) {
            try {
                localStorage.setItem(CLAVE_LOCAL + "-respaldo", crudo);
            } catch (_) {}
            return [];
        }
    }

    /* ---------- Renderizado de la lista ---------- */

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
            checkbox.checked = tarea.completada === true;
            checkbox.dataset.indice = String(indice);
            checkbox.dataset.id = tarea.id || "";
            checkbox.dataset.accion = "alternar";

            const texto = document.createElement("span");
            texto.textContent = tarea.texto;
            if (tarea.completada) texto.classList.add("completada");

            const eliminar = document.createElement("button");
            eliminar.type = "button";
            eliminar.textContent = "X";
            eliminar.classList.add("eliminar");
            eliminar.dataset.indice = String(indice);
            eliminar.dataset.id = tarea.id || "";
            eliminar.dataset.accion = "eliminar";
            eliminar.setAttribute("aria-label", "Eliminar tarea");

            elemento.append(checkbox, texto, eliminar);
            lista.appendChild(elemento);
        });
    }

    /* ---------- Operaciones CRUD (Nube si hay cuenta, Local si no) ---------- */

    async function agregar() {
        const valor = campo.value.trim();

        if (valor === "") {
            alert("Escribe una tarea primero");
            return;
        }

        if (valor.length > 250) {
            alert("Máximo 250 caracteres");
            return;
        }

        campo.value = "";
        campo.focus();

        // Si el usuario inició sesión, guarda en Firestore (se refleja al instante en todos los dispositivos)
        if (usuarioActual && fb) {
            try {
                const refColeccion = fb.collection(
                    fb.db,
                    "usuarios",
                    usuarioActual.uid,
                    "tareas"
                );
                await fb.addDoc(refColeccion, {
                    texto: valor,
                    completada: false,
                    creadaEn: Date.now()
                });
            } catch (error) {
                console.error("Error guardando tarea en la nube:", error);
                mostrarErrorAuth(traducirErrorFirebase(error));
            }
            return;
        }

        // Modo local si aún no ha iniciado sesión
        tareas.push({
            id: `local-${Date.now()}`,
            texto: valor,
            completada: false,
            creadaEn: Date.now()
        });
        guardarTareasLocales();
        cargarTareas();
    }

    lista.addEventListener("click", async (evento) => {
        const objetivo = evento.target;
        const accion = objetivo.dataset && objetivo.dataset.accion;
        if (accion !== "eliminar") return;

        const indice = Number(objetivo.dataset.indice);
        if (!Number.isInteger(indice) || !tareas[indice]) return;
        const tarea = tareas[indice];

        if (usuarioActual && fb && tarea.id) {
            try {
                const refDoc = fb.doc(
                    fb.db,
                    "usuarios",
                    usuarioActual.uid,
                    "tareas",
                    tarea.id
                );
                await fb.deleteDoc(refDoc);
            } catch (error) {
                console.error("Error eliminando tarea en la nube:", error);
                mostrarErrorAuth(traducirErrorFirebase(error));
            }
            return;
        }

        tareas.splice(indice, 1);
        guardarTareasLocales();
        cargarTareas();
    });

    lista.addEventListener("change", async (evento) => {
        const objetivo = evento.target;
        if (!objetivo.dataset || objetivo.dataset.accion !== "alternar") return;

        const indice = Number(objetivo.dataset.indice);
        if (!Number.isInteger(indice) || !tareas[indice]) return;
        const tarea = tareas[indice];
        const nuevoEstado = objetivo.checked === true;

        if (usuarioActual && fb && tarea.id) {
            try {
                const refDoc = fb.doc(
                    fb.db,
                    "usuarios",
                    usuarioActual.uid,
                    "tareas",
                    tarea.id
                );
                await fb.updateDoc(refDoc, { completada: nuevoEstado });
            } catch (error) {
                console.error("Error actualizando tarea en la nube:", error);
                mostrarErrorAuth(traducirErrorFirebase(error));
            }
            return;
        }

        tareas[indice].completada = nuevoEstado;
        guardarTareasLocales();
        cargarTareas();
    });

    boton.addEventListener("click", agregar);
    campo.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") agregar();
    });

    /* ---------- Interfaz de configuración de Firebase ---------- */

    function mostrarErrorAuth(texto) {
        if (!mensajeAuth) return;
        if (!texto) {
            mensajeAuth.hidden = true;
            mensajeAuth.textContent = "";
            return;
        }
        mensajeAuth.textContent = texto;
        mensajeAuth.hidden = false;
    }

    function actualizarIndicadorRedYSync() {
        if (!indicadorSync) return;
        if (!navigator.onLine) {
            indicadorSync.textContent = "⚡ Sin red (se sincronizará al volver)";
            indicadorSync.className = "badge-modo badge-offline";
        } else {
            indicadorSync.textContent = "☁️ Sincronizado en vivo";
            indicadorSync.className = "badge-modo badge-nube";
        }
    }

    if (abrirConfigBtn) {
        abrirConfigBtn.addEventListener("click", () => {
            errorConfig.hidden = true;
            modalConfig.hidden = false;
            vistaSinConfig.hidden = true;
            textoFirebaseConfig.focus();
        });
    }

    if (cambiarConfigBtn) {
        cambiarConfigBtn.addEventListener("click", () => {
            errorConfig.hidden = true;
            const actual = obtenerConfigActiva();
            if (actual) {
                textoFirebaseConfig.value = JSON.stringify(actual, null, 2);
            }
            modalConfig.hidden = !modalConfig.hidden;
        });
    }

    if (cancelarConfigBtn) {
        cancelarConfigBtn.addEventListener("click", () => {
            modalConfig.hidden = true;
            if (!obtenerConfigActiva()) {
                vistaSinConfig.hidden = false;
            }
        });
    }

    if (guardarConfigBtn) {
        guardarConfigBtn.addEventListener("click", () => {
            try {
                const nuevaConfig = extraerConfigDeTexto(textoFirebaseConfig.value);
                localStorage.setItem(CLAVE_CONFIG_GUARDADA, JSON.stringify(nuevaConfig));
                errorConfig.hidden = true;
                modalConfig.hidden = true;
                window.location.reload();
            } catch (err) {
                errorConfig.textContent = err.message;
                errorConfig.hidden = false;
            }
        });
    }

    /* ---------- Conexión con Firebase (Auth + Firestore en tiempo real) ---------- */

    function revisarMigracionLocal(uid) {
        const locales = leerTareasLocales();
        if (locales.length === 0) {
            bannerMigracion.hidden = true;
            return;
        }

        textoMigracion.textContent =
            `Tienes ${locales.length} tarea(s) guardadas antes en este navegador. ¿Quieres subirlas a tu cuenta sincronizada?`;
        bannerMigracion.hidden = false;

        subirLocalesBtn.onclick = async () => {
            if (!fb || !uid) return;
            subirLocalesBtn.disabled = true;
            try {
                const refColeccion = fb.collection(fb.db, "usuarios", uid, "tareas");
                for (const t of locales) {
                    await fb.addDoc(refColeccion, {
                        texto: t.texto,
                        completada: t.completada === true,
                        creadaEn: t.creadaEn || Date.now()
                    });
                }
                localStorage.removeItem(CLAVE_LOCAL);
                bannerMigracion.hidden = true;
            } catch (err) {
                alert(traducirErrorFirebase(err));
            } finally {
                subirLocalesBtn.disabled = false;
            }
        };

        descartarMigracionBtn.onclick = () => {
            bannerMigracion.hidden = true;
        };
    }

    function suscribirTareasEnVivo(uid) {
        if (cancelarSuscripcionNube) {
            cancelarSuscripcionNube();
            cancelarSuscripcionNube = null;
        }

        const refColeccion = fb.collection(fb.db, "usuarios", uid, "tareas");
        const consulta = fb.query(refColeccion, fb.orderBy("creadaEn", "asc"));

        cancelarSuscripcionNube = fb.onSnapshot(
            consulta,
            { includeMetadataChanges: true },
            (instantanea) => {
                tareas = instantanea.docs.map((docSnap) => {
                    const datos = docSnap.data();
                    return {
                        id: docSnap.id,
                        texto: typeof datos.texto === "string" ? datos.texto : "",
                        completada: datos.completada === true,
                        creadaEn: typeof datos.creadaEn === "number" ? datos.creadaEn : 0
                    };
                });

                cargarTareas();

                if (instantanea.metadata.hasPendingWrites) {
                    indicadorSync.textContent = "⏳ Guardando cambios…";
                    indicadorSync.className = "badge-modo badge-offline";
                } else {
                    actualizarIndicadorRedYSync();
                }
            },
            (error) => {
                console.error("Error escuchando tareas en Firestore:", error);
                vistaLogin.hidden = false;
                mostrarErrorAuth(traducirErrorFirebase(error));
            }
        );
    }

    async function iniciarFirebase(config) {
        try {
            const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
            const [appMod, authMod, firestoreMod] = await Promise.all([
                import(`${base}/firebase-app.js`),
                import(`${base}/firebase-auth.js`),
                import(`${base}/firebase-firestore.js`)
            ]);

            const app = appMod.initializeApp(config);
            const auth = authMod.getAuth(app);

            // Caché persistente en IndexedDB: permite abrir la app sin internet,
            // agregar o tachar tareas offline, y sincronizarlas solas al recuperar red.
            let db;
            try {
                db = firestoreMod.initializeFirestore(app, {
                    localCache: firestoreMod.persistentLocalCache({
                        tabManager: firestoreMod.persistentMultipleTabManager()
                    })
                });
            } catch (_) {
                db = firestoreMod.getFirestore(app);
            }

            fb = {
                app,
                auth,
                db,
                GoogleAuthProvider: authMod.GoogleAuthProvider,
                signInWithPopup: authMod.signInWithPopup,
                signInWithRedirect: authMod.signInWithRedirect,
                signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
                createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
                signOut: authMod.signOut,
                collection: firestoreMod.collection,
                doc: firestoreMod.doc,
                addDoc: firestoreMod.addDoc,
                updateDoc: firestoreMod.updateDoc,
                deleteDoc: firestoreMod.deleteDoc,
                query: firestoreMod.query,
                orderBy: firestoreMod.orderBy,
                onSnapshot: firestoreMod.onSnapshot
            };

            // Eventos de inicio de sesión con Google
            loginGoogleBtn.addEventListener("click", async () => {
                mostrarErrorAuth("");
                const proveedor = new fb.GoogleAuthProvider();
                try {
                    await fb.signInWithPopup(fb.auth, proveedor);
                } catch (err) {
                    if (err && err.code === "auth/popup-blocked") {
                        await fb.signInWithRedirect(fb.auth, proveedor);
                    } else {
                        mostrarErrorAuth(traducirErrorFirebase(err));
                    }
                }
            });

            // Eventos de inicio de sesión con Correo y Contraseña
            formCorreo.addEventListener("submit", async (e) => {
                e.preventDefault();
                mostrarErrorAuth("");
                try {
                    await fb.signInWithEmailAndPassword(
                        fb.auth,
                        correoInput.value.trim(),
                        claveInput.value
                    );
                    claveInput.value = "";
                } catch (err) {
                    mostrarErrorAuth(traducirErrorFirebase(err));
                }
            });

            crearCuentaBtn.addEventListener("click", async () => {
                mostrarErrorAuth("");
                const correo = correoInput.value.trim();
                const clave = claveInput.value;
                if (!correo || clave.length < 6) {
                    mostrarErrorAuth("Escribe tu correo y una contraseña de al menos 6 caracteres.");
                    return;
                }
                try {
                    await fb.createUserWithEmailAndPassword(fb.auth, correo, clave);
                    claveInput.value = "";
                } catch (err) {
                    mostrarErrorAuth(traducirErrorFirebase(err));
                }
            });

            cerrarSesionBtn.addEventListener("click", async () => {
                if (cancelarSuscripcionNube) {
                    cancelarSuscripcionNube();
                    cancelarSuscripcionNube = null;
                }
                await fb.signOut(fb.auth);
            });

            // Observador de sesión: detecta automáticamente quién está conectado
            authMod.onAuthStateChanged(fb.auth, (usuario) => {
                usuarioActual = usuario;
                mostrarErrorAuth("");

                if (usuario) {
                    vistaSinConfig.hidden = true;
                    vistaLogin.hidden = true;
                    vistaConectado.hidden = false;

                    nombreUsuario.textContent =
                        usuario.displayName || usuario.email || "Cuenta sincronizada";

                    if (usuario.photoURL) {
                        fotoUsuario.src = usuario.photoURL;
                        fotoUsuario.hidden = false;
                    } else {
                        fotoUsuario.hidden = true;
                    }

                    actualizarIndicadorRedYSync();
                    suscribirTareasEnVivo(usuario.uid);
                    revisarMigracionLocal(usuario.uid);
                } else {
                    if (cancelarSuscripcionNube) {
                        cancelarSuscripcionNube();
                        cancelarSuscripcionNube = null;
                    }
                    vistaConectado.hidden = true;
                    bannerMigracion.hidden = true;
                    vistaSinConfig.hidden = true;
                    vistaLogin.hidden = false;

                    tareas = leerTareasLocales();
                    cargarTareas();
                }
            });
        } catch (error) {
            console.error("No se pudo inicializar Firebase:", error);
            vistaSinConfig.hidden = true;
            vistaLogin.hidden = false;
            mostrarErrorAuth(
                "Sin conexión inicial a Firebase o configuración inválida. Tus tareas funcionan en modo local por ahora."
            );
        }
    }

    /* ---------- Arranque inicial ---------- */

    tareas = leerTareasLocales();
    cargarTareas();

    const configActiva = obtenerConfigActiva();
    if (!configActiva) {
        vistaSinConfig.hidden = false;
        vistaLogin.hidden = true;
        vistaConectado.hidden = true;
    } else {
        vistaSinConfig.hidden = true;
        await iniciarFirebase(configActiva);
    }

    if (new URLSearchParams(window.location.search).get("accion") === "nueva") {
        campo.focus();
    }

    /* ---------- PWA e instalación ---------- */

    const botonInstalar = document.getElementById("instalarApp");
    const estadoInstalacion = document.getElementById("estadoInstalacion");

    const esAppInstalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    let eventoInstalacion = null;

    function mostrarEstadoRed() {
        actualizarIndicadorRedYSync();
        if (!estadoInstalacion) return;

        if (!navigator.onLine) {
            estadoInstalacion.textContent =
                "Sin conexión. Puedes seguir agregando o completando tareas: se sincronizarán solas al volver internet.";
        } else if (esAppInstalada) {
            estadoInstalacion.textContent = usuarioActual
                ? "App instalada y sincronizada con tu cuenta en todos tus dispositivos."
                : "Estás usando la app instalada. Inicia sesión arriba para sincronizar con otros dispositivos.";
        } else {
            estadoInstalacion.innerHTML =
                "También puedes instalarla desde el menú <strong>⋯</strong> de Edge/Chrome o <strong>Compartir → Agregar a inicio</strong> en iPhone.";
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
                "¡Listo! La app ya está instalada en tu dispositivo.";
        }
    });

    window.addEventListener("online", mostrarEstadoRed);
    window.addEventListener("offline", mostrarEstadoRed);
    mostrarEstadoRed();

    /* ---------- Service Worker ---------- */

    const estadoOffline = document.getElementById("estadoOffline");

    function marcarOffline(texto) {
        if (estadoOffline) estadoOffline.textContent = texto;
    }

    if (!("serviceWorker" in navigator)) {
        marcarOffline("Este navegador no soporta el modo sin conexión.");
    } else if (
        location.protocol !== "https:" &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1"
    ) {
        marcarOffline("El modo sin conexión y Google Login requieren abrir la página desde GitHub Pages (HTTPS) o localhost.");
    } else {
        navigator.serviceWorker
            .register("./sw.js", { updateViaCache: "none" })
            .then(async (registro) => {
                await navigator.serviceWorker.ready;

                const pintarControl = () => {
                    if (navigator.serviceWorker.controller) {
                        marcarOffline("Modo sin conexión activo + sincronización en la nube lista.");
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
