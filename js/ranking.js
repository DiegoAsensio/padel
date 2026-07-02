/**
 * ranking.js
 * -----------------------------------------------------------------------
 * Renderiza la tabla de ranking en index.html.
 * Las columnas Elo, % Victorias, % Games y Partidos Jugados son
 * ordenables: se hace clic en el encabezado para cambiar el criterio,
 * y de nuevo para invertir el sentido.
 * -----------------------------------------------------------------------
 */

const CRITERIOS_ORDEN = {
  elo: (j) => j.elo,
  partidos: (j) => j.partidos,
  victorias: (j) => j.victorias,
  derrotas: (j) => j.derrotas,
  pctVictorias: (j) => j.pctVictorias,
  pctGames: (j) => j.pctGames,
};

let estadoOrden = { criterio: "elo", direccion: "desc" };
let jugadoresCache = null;

function porcentaje(numerador, denominador) {
  if (!denominador) return 0;
  return Math.round((numerador / denominador) * 100);
}

function calcularStatsJugador(jugador) {
  return {
    ...jugador,
    pctVictorias: porcentaje(jugador.victorias, jugador.partidos),
    pctGames: porcentaje(jugador.gamesFavor, jugador.gamesFavor + jugador.gamesContra),
  };
}

function renderFormaDots(forma) {
  if (!forma.length) return '<span class="stat-muted">—</span>';
  return `<div class="forma-dots">${forma
    .map((r) => `<span class="forma-dot ${r === "W" ? "win" : "loss"}"></span>`)
    .join("")}</div>`;
}

function renderFilaRanking(jugador, posicion) {
  return `
    <tr class="pos-${posicion}">
      <td><span class="pos-num">${posicion}</span></td>
      <td>
        <div class="player-cell">
          <img class="avatar" src="${jugador.foto}" alt="" />
          <span class="player-name">${jugador.nombre}</span>
        </div>
      </td>
      <td><span class="elo-value">${Math.round(jugador.elo)}</span></td>
      <td><span class="stat-muted">${jugador.partidos}</span></td>
      <td><span class="stat-muted">${jugador.victorias}</span></td>
      <td><span class="stat-muted">${jugador.derrotas}</span></td>
      <td><span class="stat-muted">${jugador.pctVictorias}%</span></td>
      <td><span class="stat-muted">${jugador.pctGames}%</span></td>
      <td>${renderFormaDots(jugador.forma)}</td>
    </tr>
  `;
}

function actualizarIndicadoresHeader() {
  document.querySelectorAll("th[data-criterio]").forEach((th) => {
    const esActivo = th.dataset.criterio === estadoOrden.criterio;
    th.setAttribute("aria-sort", esActivo ? (estadoOrden.direccion === "desc" ? "descending" : "ascending") : "none");
    th.classList.toggle("th-activo", esActivo);
  });
}

/** Renderiza la tabla a partir de jugadoresCache (no pega contra la red). */
function renderRanking() {
  const cuerpo = document.getElementById("ranking-body");
  if (!jugadoresCache) return;

  if (!jugadoresCache.length) {
    cuerpo.innerHTML = `<tr><td colspan="9" class="empty-state">Todavía no hay jugadores cargados.</td></tr>`;
    return;
  }

  const obtenerValor = CRITERIOS_ORDEN[estadoOrden.criterio];
  const jugadores = [...jugadoresCache].sort((a, b) => {
    const diff = obtenerValor(b) - obtenerValor(a);
    return estadoOrden.direccion === "desc" ? diff : -diff;
  });

  cuerpo.innerHTML = jugadores.map((j, i) => renderFilaRanking(j, i + 1)).join("");
  actualizarIndicadoresHeader();
}

/** Trae el estado actual desde SheetDB y dispara el primer render. */
async function cargarYRenderizarRanking() {
  const cuerpo = document.getElementById("ranking-body");
  cuerpo.innerHTML = `<tr><td colspan="9" class="empty-state">Cargando ranking…</td></tr>`;
  try {
    const { jugadores } = await obtenerEstadoActual();
    jugadoresCache = jugadoresRankeables(jugadores).map(calcularStatsJugador);
    renderRanking();
  } catch (e) {
    console.error(e);
    cuerpo.innerHTML = `<tr><td colspan="9" class="empty-state">No se pudo cargar el ranking. Revisá tu conexión a internet e intentá de nuevo.</td></tr>`;
  }
}

function inicializarOrdenamiento() {
  document.querySelectorAll("th[data-criterio]").forEach((th) => {
    const activar = () => {
      const criterio = th.dataset.criterio;
      if (estadoOrden.criterio === criterio) {
        estadoOrden.direccion = estadoOrden.direccion === "desc" ? "asc" : "desc";
      } else {
        estadoOrden = { criterio, direccion: "desc" };
      }
      renderRanking();
    };
    th.addEventListener("click", activar);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activar();
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  inicializarOrdenamiento();
  cargarYRenderizarRanking();
});
