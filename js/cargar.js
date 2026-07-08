/**
 * cargar.js
 * -----------------------------------------------------------------------
 * Maneja el formulario de "Cargar Partido":
 *  - Fecha: input nativo, por defecto hoy.
 *  - Parejas: se eligen tocando círculos (chips) de jugadores. Los
 *    primeros 2 tocados son la Pareja A, los últimos 2 la Pareja B.
 *  - Sets: cada uno se carga con steppers (+/-). Si el partido ya quedó
 *    definido antes de llegar al último set posible, los sets sobrantes
 *    se bloquean solos.
 *  - Modo edición: si la URL trae ?editar=<id>, el formulario se
 *    precarga con ese partido y al guardar se llama a editarPartido()
 *    en vez de registrarPartido().
 * -----------------------------------------------------------------------
 */

let seleccionOrden = []; // ids de jugadores, en orden de selección (máx. 4)
let formatoActual = 3;
let valoresSets = []; // [{gamesA, gamesB}, ...] longitud = formatoActual
let empateActivo = false;
let modoEdicion = false;
let idEnEdicion = null;

// Cache del Elo/estadísticas actuales de cada jugador (para la vista previa).
// Se carga una vez al entrar a la página; no hace falta repetir la consulta
// a SheetDB en cada click de +/- del formulario.
let jugadoresActualesCache = null;

async function cargarEstadoActualCache() {
  const { jugadores } = await obtenerEstadoActual();
  jugadoresActualesCache = jugadores;
}

/* ---------------------------------------------------------------------
   FECHA
   --------------------------------------------------------------------- */

function fechaHoyLocal() {
  const ahora = new Date();
  const offsetMs = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora - offsetMs).toISOString().slice(0, 10);
}

function leerFechaSeleccionada() {
  return document.getElementById("fecha-partido").value;
}

/* ---------------------------------------------------------------------
   PASO 2 — Selección de parejas por chips
   --------------------------------------------------------------------- */

function etiquetaAsignacion(id) {
  const indice = seleccionOrden.indexOf(id);
  if (indice === -1) return null;
  return indice < 2 ? { equipo: "a", numero: indice + 1 } : { equipo: "b", numero: indice - 1 };
}

function renderChips() {
  const grilla = document.getElementById("chips-grid");
  const jugadores = obtenerJugadoresBase();
  const alcanzoElMaximo = seleccionOrden.length >= 4;

  grilla.innerHTML = jugadores
    .map((j) => {
      const asignacion = etiquetaAsignacion(j.id);
      const seleccionado = !!asignacion;
      const deshabilitado = !seleccionado && alcanzoElMaximo;
      const claseEquipo = asignacion ? `chip-${asignacion.equipo}` : "";
      const badge = asignacion ? `<span class="chip-badge">${asignacion.equipo.toUpperCase()}${asignacion.numero}</span>` : "";

      return `
        <button type="button"
          class="jugador-chip ${claseEquipo}"
          data-id="${j.id}"
          ${deshabilitado ? "disabled" : ""}
          aria-pressed="${seleccionado}">
          <span class="chip-avatar-wrap">
            <img class="chip-avatar" src="${j.foto}" alt="" />
            ${badge}
          </span>
          <span class="chip-nombre">${j.nombre}</span>
        </button>
      `;
    })
    .join("");

  grilla.querySelectorAll(".jugador-chip").forEach((chip) => {
    chip.addEventListener("click", () => toggleJugador(chip.dataset.id));
  });
}

function actualizarResumenParejas() {
  const jugadores = obtenerJugadoresBase();
  const nombre = (id) => obtenerJugadorPorId(jugadores, id)?.nombre;

  const a = seleccionOrden.slice(0, 2).map(nombre).filter(Boolean);
  const b = seleccionOrden.slice(2, 4).map(nombre).filter(Boolean);

  document.getElementById("resumen-a-nombres").textContent = a.length ? a.join(" / ") : "Elegí 2 jugadores";
  document.getElementById("resumen-b-nombres").textContent = b.length ? b.join(" / ") : "Elegí 2 jugadores";
}

function toggleJugador(id) {
  const indice = seleccionOrden.indexOf(id);
  if (indice !== -1) {
    seleccionOrden.splice(indice, 1);
  } else if (seleccionOrden.length < 4) {
    seleccionOrden.push(id);
  }
  renderChips();
  actualizarResumenParejas();
  actualizarPreview();
}

function obtenerSeleccionParejas() {
  if (seleccionOrden.length !== 4) return null;
  return { parejaA: seleccionOrden.slice(0, 2), parejaB: seleccionOrden.slice(2, 4) };
}

/* ---------------------------------------------------------------------
   PASO 3 — Resultado por set con steppers + bloqueo automático
   --------------------------------------------------------------------- */

function setTerminado(set) {
  return Math.max(set.gamesA, set.gamesB) === 6;
}

function recalcularBloqueoSets() {
  const necesarios = Math.ceil(formatoActual / 2);
  let setsA = 0;
  let setsB = 0;
  let indiceDefinicion = null;

  valoresSets.forEach((set, i) => {
    if (indiceDefinicion !== null) {
      set.gamesA = 0;
      set.gamesB = 0;
      return;
    }
    if (setTerminado(set)) {
      if (set.gamesA > set.gamesB) setsA++;
      else if (set.gamesB > set.gamesA) setsB++;
    }
    if (setsA === necesarios || setsB === necesarios) {
      indiceDefinicion = i;
    }
  });

  return indiceDefinicion;
}

function renderSetsInputs() {
  const contenedor = document.getElementById("sets-inputs");
  const indiceDefinicion = recalcularBloqueoSets();

  contenedor.innerHTML = valoresSets
    .map((set, i) => {
      const bloqueado = indiceDefinicion !== null && i > indiceDefinicion;
      return `
        <div class="set-card ${bloqueado ? "set-card--bloqueado" : ""}">
          <span class="set-card__label">Set ${i + 1}</span>
          ${bloqueado
            ? `<span class="set-card__definido">Partido definido, no hace falta cargarlo</span>`
            : `
              <div class="stepper-row">
                <div class="stepper" data-lado="A">
                  <span class="stepper__equipo">Pareja A</span>
                  <div class="stepper__controles">
                    <button type="button" class="stepper__btn" data-set="${i}" data-lado="gamesA" data-delta="-1" aria-label="Restar game a pareja A, set ${i + 1}">−</button>
                    <span class="stepper__valor">${set.gamesA}</span>
                    <button type="button" class="stepper__btn" data-set="${i}" data-lado="gamesA" data-delta="1" aria-label="Sumar game a pareja A, set ${i + 1}">+</button>
                  </div>
                </div>
                <div class="stepper" data-lado="B">
                  <span class="stepper__equipo">Pareja B</span>
                  <div class="stepper__controles">
                    <button type="button" class="stepper__btn" data-set="${i}" data-lado="gamesB" data-delta="-1" aria-label="Restar game a pareja B, set ${i + 1}">−</button>
                    <span class="stepper__valor">${set.gamesB}</span>
                    <button type="button" class="stepper__btn" data-set="${i}" data-lado="gamesB" data-delta="1" aria-label="Sumar game a pareja B, set ${i + 1}">+</button>
                  </div>
                </div>
              </div>
            `}
        </div>
      `;
    })
    .join("");

  contenedor.querySelectorAll(".stepper__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.set);
      const lado = btn.dataset.lado;
      const delta = Number(btn.dataset.delta);
      const nuevoValor = valoresSets[i][lado] + delta;
      if (nuevoValor < 0 || nuevoValor > 6) return;
      valoresSets[i][lado] = nuevoValor;
      renderSetsInputs();
      actualizarPreview();
    });
  });
}

function generarSets(formato, setsIniciales) {
  formatoActual = Number(formato);
  valoresSets = Array.from({ length: formatoActual }, (_, i) => {
    const inicial = setsIniciales?.[i];
    return inicial ? { gamesA: inicial.gamesA, gamesB: inicial.gamesB } : { gamesA: 0, gamesB: 0 };
  });
  renderSetsInputs();
}

function leerSetsCargados() {
  if (empateActivo) return [];
  return valoresSets.filter((s) => s.gamesA > 0 || s.gamesB > 0);
}

/* ---------------------------------------------------------------------
   EMPATE — cuando el partido termina empatado no hay sets que definir:
   se ocultan los steppers y se saltea la resolución de ganador/Elo.
   --------------------------------------------------------------------- */

function actualizarVisibilidadSets() {
  const contenedorSets = document.getElementById("sets-inputs");
  contenedorSets.style.display = empateActivo ? "none" : "";
}

function alternarEmpate(activo) {
  empateActivo = activo;
  actualizarVisibilidadSets();
  actualizarPreview();
}

/* ---------------------------------------------------------------------
   VISTA PREVIA
   --------------------------------------------------------------------- */

function actualizarPreview() {
  const preview = document.getElementById("preview-panel");
  const parejas = obtenerSeleccionParejas();

  if (!parejas) {
    preview.innerHTML = `<span class="stat-muted">Completá las 2 parejas para ver la vista previa.</span>`;
    return;
  }

  if (empateActivo) {
    preview.innerHTML = `
      <div class="preview-row"><span>Resultado</span><strong>Empate</strong></div>
      <div class="preview-row"><span>Cambio Elo para los 4 jugadores</span><strong>+${PUNTOS_EMPATE}</strong></div>
      <div class="preview-row"><span class="stat-muted">El Invitado no suma puntos, como en cualquier partido.</span></div>
    `;
    return;
  }

  const sets = leerSetsCargados();

  if (!sets.length) {
    preview.innerHTML = `<span class="stat-muted">Completá las 2 parejas y al menos un set para ver la vista previa.</span>`;
    return;
  }

  if (!jugadoresActualesCache) {
    preview.innerHTML = `<span class="stat-muted">Cargando datos del ranking…</span>`;
    return;
  }

  const jugadores = jugadoresActualesCache;
  const jA1 = obtenerJugadorPorId(jugadores, parejas.parejaA[0]);
  const jA2 = obtenerJugadorPorId(jugadores, parejas.parejaA[1]);
  const jB1 = obtenerJugadorPorId(jugadores, parejas.parejaB[0]);
  const jB2 = obtenerJugadorPorId(jugadores, parejas.parejaB[1]);

  const resultado = resolverGanadorPartido(sets);
  const { cambioA, cambioB, probabilidadA } = calcularCambioElo({
    eloA1: jA1.elo,
    eloA2: jA2.elo,
    eloB1: jB1.elo,
    eloB2: jB2.elo,
    ganoA: resultado.ganoA,
    totalGamesA: resultado.totalGamesA,
    totalGamesB: resultado.totalGamesB,
  });

  const ganadora = resultado.ganoA ? `${jA1.nombre} / ${jA2.nombre}` : `${jB1.nombre} / ${jB2.nombre}`;

  preview.innerHTML = `
    <div class="preview-row"><span>Probabilidad de victoria pareja A</span><strong>${Math.round(probabilidadA * 100)}%</strong></div>
    <div class="preview-row"><span>Va ganando</span><strong>${ganadora}</strong></div>
    <div class="preview-row"><span>Diferencia de games</span><strong>${Math.abs(resultado.totalGamesA - resultado.totalGamesB)}</strong></div>
    <div class="preview-row"><span>Cambio Elo pareja A</span><strong>${cambioA > 0 ? "+" : ""}${cambioA}</strong></div>
    <div class="preview-row"><span>Cambio Elo pareja B</span><strong>${cambioB > 0 ? "+" : ""}${cambioB}</strong></div>
  `;
  if (modoEdicion) {
    preview.innerHTML += `<div class="preview-row"><span class="stat-muted">Los valores de Elo se recalculan del todo al guardar, esto es sólo una vista previa.</span></div>`;
  }
}

/* ---------------------------------------------------------------------
   ENVÍO Y VALIDACIÓN
   --------------------------------------------------------------------- */

function mostrarFeedback(mensaje, tipo) {
  const banner = document.getElementById("feedback-banner");
  banner.textContent = mensaje;
  banner.className = `feedback-banner show ${tipo}`;
  banner.scrollIntoView({ behavior: "smooth", block: "center" });
}

function validarFormulario(parejas, sets, fecha) {
  if (!fecha) return "Elegí la fecha del partido.";
  if (!parejas) return "Elegí 4 jugadores: 2 para cada pareja.";
  if (empateActivo) return null;

  if (!sets.length) return "Cargá el resultado de al menos un set.";

  const resultado = resolverGanadorPartido(sets);
  if (resultado.setsGanadosA === resultado.setsGanadosB) {
    return "El partido no puede terminar empatado en sets: revisá los resultados cargados, o marcá la opción \"Fue empate\" si así terminó.";
  }
  return null;
}

function resetearFormulario() {
  seleccionOrden = [];
  renderChips();
  actualizarResumenParejas();
  const formatoSeleccionado = document.querySelector('input[name="formato"]:checked')?.value || 3;
  generarSets(formatoSeleccionado);
  document.getElementById("fecha-partido").value = fechaHoyLocal();
  document.getElementById("check-empate").checked = false;
  alternarEmpate(false);
  document.getElementById("feedback-banner").className = "feedback-banner";
}

async function manejarSubmit(event) {
  event.preventDefault();

  const parejas = obtenerSeleccionParejas();
  const sets = leerSetsCargados();
  const fecha = leerFechaSeleccionada();

  const error = validarFormulario(parejas, sets, fecha);
  if (error) {
    mostrarFeedback(error, "error");
    return;
  }

  const datos = { fecha, formato: formatoActual, parejaA: parejas.parejaA, parejaB: parejas.parejaB, sets, empate: empateActivo };

  const botonGuardar = document.getElementById("btn-guardar");
  const textoOriginalBoton = botonGuardar.textContent;
  botonGuardar.disabled = true;
  botonGuardar.textContent = "Guardando…";

  try {
    if (modoEdicion) {
      await editarPartido(idEnEdicion, datos);
      mostrarFeedback("Partido editado. Volviendo al historial…", "success");
      setTimeout(() => {
        window.location.href = "historial.html";
      }, 900);
      return;
    }

    await registrarPartido(datos);
    mostrarFeedback("Partido guardado. El ranking ya se actualizó.", "success");
    resetearFormulario();
    await cargarEstadoActualCache(); // refrescamos el Elo base para el próximo partido
  } catch (e) {
    console.error(e);
    mostrarFeedback("No se pudo guardar el partido. Revisá tu conexión a internet e intentá de nuevo.", "error");
  } finally {
    botonGuardar.disabled = false;
    botonGuardar.textContent = textoOriginalBoton;
  }
}

/* ---------------------------------------------------------------------
   MODO EDICIÓN
   --------------------------------------------------------------------- */

function activarModoEdicion(partido) {
  modoEdicion = true;
  idEnEdicion = partido.id;

  seleccionOrden = [...partido.parejaA, ...partido.parejaB];
  document.querySelector(`input[name="formato"][value="${partido.formato}"]`).checked = true;
  document.getElementById("fecha-partido").value = partido.fecha;
  document.getElementById("check-empate").checked = !!partido.empate;
  empateActivo = !!partido.empate;
  actualizarVisibilidadSets();

  renderChips();
  actualizarResumenParejas();
  generarSets(partido.formato, partido.sets);

  document.getElementById("page-eyebrow").textContent = "Editando partido";
  document.getElementById("page-titulo").textContent = "Editar partido";
  document.getElementById("btn-guardar").textContent = "Guardar cambios";

  const banner = document.getElementById("editar-banner");
  banner.style.display = "block";
  banner.className = "feedback-banner show info";
  banner.innerHTML = `Estás editando un partido ya cargado. <a href="historial.html">Cancelar y volver al historial</a>.`;

  actualizarPreview();
}

async function inicializarFormulario() {
  document.getElementById("fecha-partido").value = fechaHoyLocal();

  renderChips();
  actualizarResumenParejas();
  generarSets(formatoActual); // formato por defecto: mejor de 3

  document.querySelectorAll('input[name="formato"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      generarSets(e.target.value);
      actualizarPreview();
    });
  });

  document.getElementById("fecha-partido").addEventListener("change", actualizarPreview);
  document.getElementById("check-empate").addEventListener("change", (e) => alternarEmpate(e.target.checked));
  document.getElementById("btn-limpiar").addEventListener("click", resetearFormulario);
  document.getElementById("form-cargar-partido").addEventListener("submit", manejarSubmit);

  try {
    await cargarEstadoActualCache();
  } catch (e) {
    console.error(e);
    mostrarFeedback("No se pudo conectar con la base de datos. Revisá tu conexión a internet y recargá la página.", "error");
  }
  actualizarPreview();

  const idEditar = new URLSearchParams(window.location.search).get("editar");
  if (idEditar) {
    try {
      const partido = await obtenerPartidoPorId(idEditar);
      if (partido) {
        activarModoEdicion(partido);
      } else {
        mostrarFeedback("No se encontró el partido que querés editar.", "error");
      }
    } catch (e) {
      console.error(e);
      mostrarFeedback("No se pudo cargar el partido a editar. Revisá tu conexión a internet.", "error");
    }
  }
}

document.addEventListener("DOMContentLoaded", inicializarFormulario);
