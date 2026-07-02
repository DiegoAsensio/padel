/**
 * elo.js
 * -----------------------------------------------------------------------
 * Implementación del sistema de Elo descripto en
 * "Especificación Técnica – Sistema de Ranking Americano de Pádel (v1.0)".
 *
 * Resumen del modelo:
 *  - Rating de una pareja = promedio del Elo de sus dos integrantes.
 *  - Probabilidad esperada de que la pareja A le gane a la B:
 *        E_A = 1 / (1 + 10^((Rating_B - Rating_A) / 400))
 *  - Cambio base = K * (Resultado - Esperado), con K = 20.
 *    Resultado es 1 si ganó, 0 si perdió.
 *  - Bonus por diferencia total de games (se suma al ganador,
 *    se resta al perdedor).
 *  - El cambio final es el mismo para ambos integrantes de cada pareja.
 *
 * Estas funciones son puras (no tocan localStorage ni el DOM), para que
 * se puedan testear o reutilizar fácilmente.
 * -----------------------------------------------------------------------
 */

const ELO_K = 20;

/**
 * Divisor de la fórmula de probabilidad esperada. 400 es el estándar de
 * ajedrez. Se probaron valores más bajos (100, luego 250) para que el
 * sistema reaccionara más rápido con pocos partidos jugados, a costa de
 * generar más distorsión cuando una pareja favorita pierde un partido
 * ajustado. Con 400, la probabilidad reacciona más lento ante
 * diferencias de Elo chicas (las esperables en este grupo, que no juega
 * muchísimos partidos), pero es la referencia "de libro" y la más
 * conservadora. Ajustable acá si hace falta afinarlo.
 */
const ELO_DIVISOR = 400;

/** Tabla de bonus según la diferencia total de games del partido. */
const TRAMOS_BONUS = [
  { max: 2, bonus: 0 },
  { max: 5, bonus: 1 },
  { max: 8, bonus: 2 },
  { max: 11, bonus: 3 },
  { max: Infinity, bonus: 4 },
];

function calcularBonusPorDiferencia(diferenciaGames) {
  const tramo = TRAMOS_BONUS.find((t) => diferenciaGames <= t.max);
  return tramo.bonus;
}

/** Probabilidad esperada de que la pareja con `ratingPropio` le gane a `ratingRival`. */
function calcularProbabilidadEsperada(ratingPropio, ratingRival) {
  return 1 / (1 + Math.pow(10, (ratingRival - ratingPropio) / ELO_DIVISOR));
}

function ratingPareja(eloJugador1, eloJugador2) {
  return (eloJugador1 + eloJugador2) / 2;
}

/**
 * Calcula el cambio de Elo para ambas parejas de un partido.
 *
 * @param {Object} params
 * @param {number} params.eloA1 - Elo del jugador 1 de la pareja A
 * @param {number} params.eloA2 - Elo del jugador 2 de la pareja A
 * @param {number} params.eloB1 - Elo del jugador 1 de la pareja B
 * @param {number} params.eloB2 - Elo del jugador 2 de la pareja B
 * @param {boolean} params.ganoA - true si la pareja A ganó el partido
 * @param {number} params.totalGamesA - suma total de games ganados por A (todos los sets)
 * @param {number} params.totalGamesB - suma total de games ganados por B (todos los sets)
 * @returns {{cambioA: number, cambioB: number, probabilidadA: number, bonus: number}}
 */
function calcularCambioElo({ eloA1, eloA2, eloB1, eloB2, ganoA, totalGamesA, totalGamesB }) {
  const ratingA = ratingPareja(eloA1, eloA2);
  const ratingB = ratingPareja(eloB1, eloB2);

  const probabilidadA = calcularProbabilidadEsperada(ratingA, ratingB);
  const resultadoA = ganoA ? 1 : 0;
  const baseA = ELO_K * (resultadoA - probabilidadA);

  const diferenciaGames = Math.abs(totalGamesA - totalGamesB);
  const bonus = calcularBonusPorDiferencia(diferenciaGames);
  const bonusA = ganoA ? bonus : -bonus;

  const cambioA = Math.round(baseA + bonusA);
  const cambioB = -cambioA;

  return { cambioA, cambioB, probabilidadA, bonus };
}

/**
 * Determina la pareja ganadora de un partido a partir de los sets.
 * Gana quien se lleva más sets (mejor de 1, 3 o 5).
 * @param {{gamesA: number, gamesB: number}[]} sets
 * @returns {{ganoA: boolean, setsGanadosA: number, setsGanadosB: number, totalGamesA: number, totalGamesB: number}}
 */
function resolverGanadorPartido(sets) {
  let setsGanadosA = 0;
  let setsGanadosB = 0;
  let totalGamesA = 0;
  let totalGamesB = 0;

  for (const set of sets) {
    totalGamesA += set.gamesA;
    totalGamesB += set.gamesB;
    if (set.gamesA > set.gamesB) setsGanadosA++;
    else if (set.gamesB > set.gamesA) setsGanadosB++;
  }

  return {
    ganoA: setsGanadosA > setsGanadosB,
    setsGanadosA,
    setsGanadosB,
    totalGamesA,
    totalGamesB,
  };
}
