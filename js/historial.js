/**
 * historial.js
 * -----------------------------------------------------------------------
 * Renderiza el historial en historial.html, agrupado por día (más
 * reciente primero). Cada partido se muestra como dos filas tipo
 * marcador, con acciones para editarlo o borrarlo. Los partidos editados
 * quedan marcados con un indicador "Editado".
 * -----------------------------------------------------------------------
 */

function formatearFechaGrupo(fechaISO) {
  // fechaISO viene como "YYYY-MM-DD"; se arma con hora fija para que no
  // haya corrimiento de día por huso horario al convertir a Date.
  const fecha = new Date(`${fechaISO}T00:00:00`);
  const texto = fecha.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearHora(isoString) {
  return new Date(isoString).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function nombreJugador(jugadores, id) {
  const j = obtenerJugadorPorId(jugadores, id);
  return j ? j.nombre : "—";
}

function fotoJugador(jugadores, id) {
  const j = obtenerJugadorPorId(jugadores, id);
  return j ? j.foto : "assets/images/avatar-generic.svg";
}

function renderDelta(cambio) {
  if (!cambio) return "";
  const signo = cambio > 0 ? "+" : "";
  const clase = cambio > 0 ? "up" : "down";
  return `<span class="match-row__delta ${clase}">${signo}${cambio} Elo</span>`;
}

function renderAvatares(jugadores, ids) {
  return ids.map((id) => `<img class="avatar" src="${fotoJugador(jugadores, id)}" alt="" />`).join("");
}

function renderSetChips(sets, lado) {
  return sets
    .map((s) => {
      const propio = lado === "A" ? s.gamesA : s.gamesB;
      const rival = lado === "A" ? s.gamesB : s.gamesA;
      const gano = propio > rival;
      return `<span class="set-chip ${gano ? "set-chip--ganado" : ""}">${propio}</span>`;
    })
    .join("");
}

function renderFilaEquipo(jugadores, { ids, sets, lado, setsGanados, cambio, esGanadora }) {
  const nombres = ids.map((id) => nombreJugador(jugadores, id)).join(" / ");
  return `
    <div class="match-row ${esGanadora ? "match-row--ganadora" : ""}">
      <div class="match-row__team">
        <div class="match-row__avatars">${renderAvatares(jugadores, ids)}</div>
        <span class="match-row__names">${nombres}</span>
      </div>
      <div class="match-row__sets">${renderSetChips(sets, lado)}</div>
      <div class="match-row__total">${setsGanados}</div>
      ${renderDelta(cambio)}
    </div>
  `;
}

function renderTarjetaPartido(partido, jugadores) {
  const ganoA = partido.ganadora === "A";
  const cambioA = partido.cambios[partido.parejaA[0]] ?? 0;
  const cambioB = partido.cambios[partido.parejaB[0]] ?? 0;

  return `
    <article class="match-card">
      <div class="match-card__meta">
        <span>Mejor de ${partido.formato} · cargado ${formatearHora(partido.creadoEn)}${partido.editado ? ` · <span class="match-card__editado">editado</span>` : ""}</span>
      </div>
      <div class="match-rows">
        ${renderFilaEquipo(jugadores, {
          ids: partido.parejaA,
          sets: partido.sets,
          lado: "A",
          setsGanados: partido.setsGanadosA,
          cambio: cambioA,
          esGanadora: ganoA,
        })}
        ${renderFilaEquipo(jugadores, {
          ids: partido.parejaB,
          sets: partido.sets,
          lado: "B",
          setsGanados: partido.setsGanadosB,
          cambio: cambioB,
          esGanadora: !ganoA,
        })}
      </div>
      <div class="match-card__actions">
        <a href="cargar.html?editar=${partido.id}" class="btn btn-ghost btn-sm">Editar</a>
        <button type="button" class="btn btn-ghost btn-sm btn-borrar" data-id="${partido.id}">Borrar</button>
      </div>
    </article>
  `;
}

/** Agrupa los partidos por fecha (día) y ordena: días recientes primero, y dentro del día, lo cargado más reciente primero. */
function agruparPorDia(partidos) {
  const ordenados = [...partidos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return new Date(b.creadoEn) - new Date(a.creadoEn);
  });

  const grupos = [];
  for (const partido of ordenados) {
    const grupoExistente = grupos.find((g) => g.fecha === partido.fecha);
    if (grupoExistente) {
      grupoExistente.partidos.push(partido);
    } else {
      grupos.push({ fecha: partido.fecha, partidos: [partido] });
    }
  }
  return grupos;
}

function renderGrupoDia(grupo, jugadores) {
  return `
    <section class="match-day-group">
      <h2 class="match-day-group__titulo">${formatearFechaGrupo(grupo.fecha)}</h2>
      <div class="match-list">
        ${grupo.partidos.map((p) => renderTarjetaPartido(p, jugadores)).join("")}
      </div>
    </section>
  `;
}

function adjuntarAccionesBorrar() {
  document.querySelectorAll(".btn-borrar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = window.confirm("¿Borrar este partido? El ranking se va a recalcular sin él. Esta acción no se puede deshacer.");
      if (!confirmado) return;

      btn.disabled = true;
      btn.textContent = "Borrando…";
      try {
        await borrarPartido(btn.dataset.id);
        await renderHistorial();
      } catch (e) {
        console.error(e);
        window.alert("No se pudo borrar el partido. Revisá tu conexión a internet e intentá de nuevo.");
        btn.disabled = false;
        btn.textContent = "Borrar";
      }
    });
  });
}

async function renderHistorial() {
  const contenedor = document.getElementById("match-list");
  contenedor.innerHTML = `<p class="empty-state">Cargando historial…</p>`;

  try {
    const { jugadores, partidos } = await obtenerEstadoActual();

    if (!partidos.length) {
      contenedor.innerHTML = `<p class="empty-state">Todavía no se cargó ningún partido. Andá a "Cargar Partido" para sumar el primero.</p>`;
      return;
    }

    const grupos = agruparPorDia(partidos);
    contenedor.innerHTML = grupos.map((g) => renderGrupoDia(g, jugadores)).join("");
    adjuntarAccionesBorrar();
  } catch (e) {
    console.error(e);
    contenedor.innerHTML = `<p class="empty-state">No se pudo cargar el historial. Revisá tu conexión a internet e intentá de nuevo.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", renderHistorial);
