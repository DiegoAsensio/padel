/**
 * partidos.js
 * -----------------------------------------------------------------------
 * Registra, edita y borra partidos. La pieza clave es
 * `recalcularJugadoresDesdeCero`: en vez de aplicar el cambio de Elo de
 * un partido nuevo sobre el estado actual (lo que rompería todo si
 * después se edita o borra un partido viejo), cada vez que algo cambia
 * se recalculan TODOS los partidos en orden cronológico, desde el Elo
 * inicial de cada jugador. Con pocos partidos por grupo esto es barato
 * y evita cualquier desincronización entre el ranking y el historial.
 * -----------------------------------------------------------------------
 */

const FORMA_MAX_LARGO = 5;

function generarId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

/** Jugador reseteado a su estado base (Elo inicial, sin partidos). */
function reiniciarStatsJugador(jugador) {
  return {
    ...jugador,
    elo: ELO_INICIAL,
    partidos: 0,
    victorias: 0,
    derrotas: 0,
    gamesFavor: 0,
    gamesContra: 0,
    forma: [],
  };
}

/** Orden cronológico real: por fecha del partido y, dentro del mismo día, por cuándo se cargó. */
function ordenarCronologicamente(partidos) {
  return [...partidos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return new Date(a.creadoEn) - new Date(b.creadoEn);
  });
}

/**
 * Recalcula el Elo y las estadísticas de todos los jugadores desde cero,
 * reproduciendo los partidos en orden cronológico. También actualiza el
 * campo `cambios` de cada partido con el valor recalculado, para que el
 * historial siempre muestre el número correcto.
 *
 * @returns {{ jugadores: Object[], partidos: Object[] }}
 */
function recalcularJugadoresDesdeCero(partidos) {
  const jugadores = obtenerJugadoresBase();
  const ordenados = ordenarCronologicamente(partidos);

  for (const partido of ordenados) {
    const [idA1, idA2] = partido.parejaA;
    const [idB1, idB2] = partido.parejaB;

    const jA1 = obtenerJugadorPorId(jugadores, idA1);
    const jA2 = obtenerJugadorPorId(jugadores, idA2);
    const jB1 = obtenerJugadorPorId(jugadores, idB1);
    const jB2 = obtenerJugadorPorId(jugadores, idB2);

    const resultado = resolverGanadorPartido(partido.sets);
    const { cambioA, cambioB } = calcularCambioElo({
      eloA1: jA1.elo,
      eloA2: jA2.elo,
      eloB1: jB1.elo,
      eloB2: jB2.elo,
      ganoA: resultado.ganoA,
      totalGamesA: resultado.totalGamesA,
      totalGamesB: resultado.totalGamesB,
    });

    const cambios = {};

    function aplicarCambio(jugador, cambio, gamesFavor, gamesContra, gano) {
      cambios[jugador.id] = jugador.invitado ? 0 : cambio;
      if (jugador.invitado) return;

      jugador.elo += cambio;
      jugador.partidos += 1;
      if (gano) jugador.victorias += 1;
      else jugador.derrotas += 1;
      jugador.gamesFavor += gamesFavor;
      jugador.gamesContra += gamesContra;

      jugador.forma.push(gano ? "W" : "L");
      if (jugador.forma.length > FORMA_MAX_LARGO) jugador.forma.shift();
    }

    aplicarCambio(jA1, cambioA, resultado.totalGamesA, resultado.totalGamesB, resultado.ganoA);
    aplicarCambio(jA2, cambioA, resultado.totalGamesA, resultado.totalGamesB, resultado.ganoA);
    aplicarCambio(jB1, cambioB, resultado.totalGamesB, resultado.totalGamesA, !resultado.ganoA);
    aplicarCambio(jB2, cambioB, resultado.totalGamesB, resultado.totalGamesA, !resultado.ganoA);

    // Persistimos en el propio partido el resultado recalculado.
    partido.ganadora = resultado.ganoA ? "A" : "B";
    partido.setsGanadosA = resultado.setsGanadosA;
    partido.setsGanadosB = resultado.setsGanadosB;
    partido.totalGamesA = resultado.totalGamesA;
    partido.totalGamesB = resultado.totalGamesB;
    partido.cambios = cambios;
  }

  return { jugadores, partidos };
}

/**
 * Trae el estado completo y actualizado de la app: los partidos crudos
 * guardados en SheetDB, recalculados para obtener el Elo y las
 * estadísticas vigentes de cada jugador. Usalo en ranking.js,
 * historial.js y cargar.js en vez de llamar cargarPartidos() +
 * recalcularJugadoresDesdeCero() por separado.
 *
 * @returns {Promise<{ jugadores: Object[], partidos: Object[] }>}
 */
async function obtenerEstadoActual() {
  const partidos = await cargarPartidos();
  return recalcularJugadoresDesdeCero(partidos);
}

/**
 * Registra un partido nuevo.
 * @param {Object} datos
 * @param {string} datos.fecha - fecha del partido, formato "YYYY-MM-DD"
 * @param {number} datos.formato - 1, 3 o 5
 * @param {[string, string]} datos.parejaA
 * @param {[string, string]} datos.parejaB
 * @param {{gamesA: number, gamesB: number}[]} datos.sets
 * @returns {Promise<Object>} el partido creado
 */
async function registrarPartido(datos) {
  const partidoNuevo = {
    id: generarId(),
    fecha: datos.fecha,
    creadoEn: new Date().toISOString(),
    formato: datos.formato,
    parejaA: datos.parejaA,
    parejaB: datos.parejaB,
    sets: datos.sets,
    editado: false,
    editadoEn: null,
  };

  await crearPartidoRemoto(partidoNuevo);
  return partidoNuevo;
}

/**
 * Edita un partido existente. Marca el registro como editado (con fecha
 * de edición) para que quede asentado en el historial. Conserva el
 * "creadoEn" original para no alterar el orden cronológico de carga.
 */
async function editarPartido(id, datos) {
  const partidos = await cargarPartidos();
  const original = partidos.find((p) => p.id === id);
  if (!original) return null;

  const partidoActualizado = {
    id,
    fecha: datos.fecha,
    creadoEn: original.creadoEn,
    formato: datos.formato,
    parejaA: datos.parejaA,
    parejaB: datos.parejaB,
    sets: datos.sets,
    editado: true,
    editadoEn: new Date().toISOString(),
  };

  await actualizarPartidoRemoto(id, partidoActualizado);
  return partidoActualizado;
}

async function borrarPartido(id) {
  await borrarPartidoRemoto(id);
}

async function obtenerPartidoPorId(id) {
  const partidos = await cargarPartidos();
  return partidos.find((p) => p.id === id);
}
