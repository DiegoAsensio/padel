/**
 * data.js
 * -----------------------------------------------------------------------
 * Datos semilla (jugadores fijos) y acceso a la base de datos remota
 * (SheetDB, que expone un Google Sheet como API REST).
 *
 * CÓMO FUNCIONA LA PERSISTENCIA:
 * Solo se guarda en SheetDB la tabla de PARTIDOS (fecha, parejas, sets).
 * No hace falta guardar el ranking de jugadores por separado: cada vez
 * que se necesita (para la tabla de ranking, el historial o la vista
 * previa de un partido nuevo) se recalculan el Elo y las estadísticas
 * de todos los jugadores desde cero, reproduciendo todos los partidos
 * guardados en orden cronológico (ver recalcularJugadoresDesdeCero en
 * partidos.js). Así el ranking nunca puede desincronizarse del
 * historial: son la misma fuente de verdad.
 *
 * Todas las funciones que hablan con SheetDB son asíncronas (devuelven
 * una Promise), porque implican una llamada de red.
 * -----------------------------------------------------------------------
 */

// URL de la API de SheetDB conectada al Google Sheet del grupo.
const SHEETDB_URL = "https://sheetdb.io/api/v1/g1huy2f4ycw3h";

const ELO_INICIAL = 100;

/**
 * Jugadores base: 7 jugadores fijos + 1 Invitado.
 * "invitado" en true significa: participa en partidos pero NO aparece
 * en la tabla de ranking y su Elo queda siempre fijo en 100 (no se
 * actualiza tras los partidos).
 */
const JUGADORES_SEED = [
  { id: "gata", nombre: "Gata", foto: "assets/images/gata.png" },
  { id: "diego", nombre: "Diego", foto: "assets/images/diego.png" },
  { id: "joaco", nombre: "Joaco" },
  { id: "colo", nombre: "Colo", foto: "assets/images/colo.png" },
  { id: "nacho", nombre: "Nacho", foto: "assets/images/nacho.png" },
  { id: "enzo", nombre: "Enzo" },
  { id: "monti", nombre: "Monti", foto: "assets/images/monti.png" },
  { id: "invitado", nombre: "Invitado", invitado: true },
].map((j) => ({
  id: j.id,
  nombre: j.nombre,
  invitado: !!j.invitado,
  foto: j.foto || "assets/images/tapia.png",
  elo: ELO_INICIAL,
  partidos: 0,
  victorias: 0,
  derrotas: 0,
  empates: 0,
  gamesFavor: 0,
  gamesContra: 0,
  forma: [], // últimos resultados: "W" | "L" | "E", más reciente al final
}));

/**
 * Devuelve los jugadores en su estado base (Elo inicial, 0 partidos).
 * Nombre y foto siempre salen de JUGADORES_SEED, que es la fuente de
 * verdad en el código: si se actualiza una foto acá, se ve reflejada
 * al toque sin tocar la base de datos.
 */
function obtenerJugadoresBase() {
  return structuredClone(JUGADORES_SEED);
}

/* ---------------------------------------------------------------------
   SHEETDB — conversión entre el objeto "partido" que usa la app y la
   fila plana que entiende una hoja de Google Sheets. Los campos que son
   arrays u objetos (parejaA, parejaB, sets) se guardan como texto JSON
   en una sola celda.
   --------------------------------------------------------------------- */

function partidoAFila(partido) {
  return {
    id: partido.id,
    fecha: partido.fecha,
    creadoEn: partido.creadoEn,
    formato: partido.formato,
    parejaA: JSON.stringify(partido.parejaA),
    parejaB: JSON.stringify(partido.parejaB),
    sets: JSON.stringify(partido.sets),
    empate: partido.empate ? "true" : "false",
    editado: partido.editado ? "true" : "false",
    editadoEn: partido.editadoEn || "",
  };
}

function filaAPartido(fila) {
  return {
    id: fila.id,
    fecha: fila.fecha,
    creadoEn: fila.creadoEn,
    formato: Number(fila.formato),
    parejaA: JSON.parse(fila.parejaA || "[]"),
    parejaB: JSON.parse(fila.parejaB || "[]"),
    sets: JSON.parse(fila.sets || "[]"),
    empate: String(fila.empate).toLowerCase() === "true",
    editado: String(fila.editado).toLowerCase() === "true",
    editadoEn: fila.editadoEn || null,
  };
}

/** Trae todos los partidos guardados en SheetDB (datos crudos, sin recalcular Elo). */
async function cargarPartidos() {
  const res = await fetch(SHEETDB_URL);
  if (!res.ok) {
    throw new Error(`No se pudieron cargar los partidos desde SheetDB (status ${res.status})`);
  }
  const filas = await res.json();
  return filas.map(filaAPartido);
}

/** Inserta un partido nuevo como fila en la hoja. */
async function crearPartidoRemoto(partido) {
  const res = await fetch(SHEETDB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [partidoAFila(partido)] }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo guardar el partido en SheetDB (status ${res.status})`);
  }
}

/** Actualiza la fila de un partido existente, buscándolo por su columna "id". */
async function actualizarPartidoRemoto(id, partido) {
  const res = await fetch(`${SHEETDB_URL}/id/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: partidoAFila(partido) }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo editar el partido en SheetDB (status ${res.status})`);
  }
}

/** Borra la fila de un partido, buscándolo por su columna "id". */
async function borrarPartidoRemoto(id) {
  const res = await fetch(`${SHEETDB_URL}/id/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`No se pudo borrar el partido en SheetDB (status ${res.status})`);
  }
}

function obtenerJugadorPorId(jugadores, id) {
  return jugadores.find((j) => j.id === id);
}

/** Jugadores visibles en el ranking (excluye al Invitado). */
function jugadoresRankeables(jugadores) {
  return jugadores.filter((j) => !j.invitado);
}
