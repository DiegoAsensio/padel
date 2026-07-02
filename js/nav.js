/**
 * nav.js
 * -----------------------------------------------------------------------
 * Menú hamburguesa para mobile. En desktop el nav se ve siempre (esto se
 * resuelve solo con CSS); este script solo entra en juego por debajo del
 * breakpoint mobile, donde el nav se oculta y se abre/cierra tocando el
 * botón.
 * -----------------------------------------------------------------------
 */

function inicializarNav() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("main-nav");
  if (!toggle || !nav) return;

  function cerrarMenu() {
    nav.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.classList.remove("nav-toggle--activo");
  }

  function toggleMenu() {
    const abierto = nav.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", String(abierto));
    toggle.classList.toggle("nav-toggle--activo", abierto);
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", cerrarMenu);
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !toggle.contains(e.target)) {
      cerrarMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarMenu();
  });
}

document.addEventListener("DOMContentLoaded", inicializarNav);
