# Ranking Americano de Pádel

Sitio estático (HTML + CSS + JS puro, sin frameworks ni build step) para
llevar el ranking Elo de un grupo de pádel americano.

## Estructura

```
padel-ranking/
├── index.html          → Pantalla de Ranking
├── historial.html       → Pantalla de Historial de Partidos
├── cargar.html           → Pantalla de Cargador de Partidos
├── css/
│   ├── reset.css          → reset base entre navegadores
│   ├── variables.css       → paleta, tipografía, espaciados (custom properties)
│   └── styles.css           → estilos de todo el sitio
├── js/
│   ├── data.js              → jugadores iniciales + acceso a localStorage
│   ├── elo.js                → cálculo puro del sistema de Elo
│   ├── partidos.js            → registra un partido (usa data.js + elo.js)
│   ├── ranking.js              → renderiza index.html
│   ├── historial.js             → renderiza historial.html
│   ├── cargar.js                 → lógica del formulario en cargar.html
│   └── nav.js                     → menú hamburguesa (mobile) en las 3 páginas
├── assets/images/
│   └── avatar-generic.svg   → foto genérica hasta tener las reales
└── README.md
```

No hay build step: se abre `index.html` directo en el navegador, o se sube
la carpeta entera tal cual a cualquier hosting estático (Netlify, Vercel,
GitHub Pages, un FTP tradicional, etc.).

La tabla de ranking se puede reordenar tocando los encabezados de Elo,
Partidos Jugados, % Victorias y % Games (alterna ascendente/descendente).

## Cómo se guardan los datos

El sitio no tiene backend: usa `localStorage` del navegador. Esto significa:

- Los datos quedan guardados en el navegador de quien carga los partidos.
- **No se sincronizan entre dispositivos ni entre navegadores distintos.**
  Si cargás un partido desde tu celular, no lo va a ver alguien que entre
  desde su computadora.
- Si se borra el caché/localStorage del navegador, se pierde el historial.

Esto es intencional para arrancar simple. El día que se necesite que todos
vean el mismo ranking en tiempo real, hay que:

1. Armar un backend simple (por ejemplo, una API REST + base de datos, o
   un servicio como Supabase/Firebase).
2. Reemplazar únicamente las 4 funciones de `js/data.js`
   (`cargarJugadores`, `guardarJugadores`, `cargarPartidos`,
   `guardarPartidos`) por llamadas `fetch()` a esa API.

El resto del código (`elo.js`, `partidos.js`, `ranking.js`, `historial.js`,
`cargar.js`) no necesita tocarse: nadie accede a `localStorage`
directamente, todos pasan por esas 4 funciones.

## Jugadores

Están definidos en `js/data.js`, en la constante `JUGADORES_SEED`:

- 7 jugadores con Elo inicial 100.
- 1 "Invitado" fijo con Elo 100, que participa en partidos pero **no
  aparece en el ranking** y su Elo nunca cambia (se excluye a propósito
  para no distorsionar la tabla con alguien que juega ocasionalmente).

Para agregar la foto real de cada jugador, reemplazar el valor de `foto`
de cada objeto en `JUGADORES_SEED` por la ruta de la imagen (por ejemplo
`assets/images/diego.jpg`) y agregar el archivo en `assets/images/`. Los
jugadores sin foto propia usan `assets/images/tapia.png` como genérica.
La foto (y el nombre) se sincronizan automáticamente con lo que haya en
`data.js` cada vez que se carga la página, así que no hace falta borrar
el localStorage para que se vea una foto nueva.

⚠️ Importante: si se cambia `JUGADORES_SEED` después de que el sitio ya
generó datos en el navegador, no va a tener efecto para quien ya tenga
localStorage poblado (porque el seed sólo se usa la primera vez). Para
forzar un reseteo en desarrollo, correr en la consola del navegador:

```js
localStorage.clear();
```

## Sistema de Elo

Implementado en `js/elo.js` siguiendo la especificación técnica del
documento del proyecto:

- Elo inicial: 100 puntos.
- Rating de una pareja = promedio del Elo de sus dos integrantes.
- Probabilidad esperada: `E = 1 / (1 + 10^((Rrival - Rpropio) / 400))`.
- Cambio base: `K × (Resultado − Esperado)`, con `K = 20`.
- Bonus según diferencia total de games del partido (tabla en
  `TRAMOS_BONUS`), sumado al ganador y restado al perdedor.
- El cambio final es el mismo para los dos integrantes de cada pareja.

El divisor de la fórmula de probabilidad (`ELO_DIVISOR` en `elo.js`) está
en 400, el estándar de ajedrez — la referencia más conservadora de las
tres probadas (100, 250, 400). Con este valor, la probabilidad reacciona
más lento ante diferencias de Elo chicas (las esperables en este grupo,
que no juega muchísimos partidos), pero es la que menos distorsiona el
ranking cuando una pareja favorita pierde un partido ajustado. Es la
primera variable a tocar si con el tiempo el ranking se siente
demasiado — o muy poco — sensible a la diferencia de nivel.

## Cargador de partidos

`cargar.html` no usa dropdowns: se eligen los 4 jugadores tocando sus
círculos (chips) en el orden que se quiera — los primeros 2 forman la
Pareja A, los últimos 2 la Pareja B (se ve reflejado con badges A1/A2/B1/B2
y colores). El resultado de cada set se carga con steppers (+/-), sin
teclado. Si el partido ya quedó definido antes de llegar al último set
posible (por ejemplo 2-0 en un "mejor de 3"), los sets sobrantes se
bloquean solos y se muestran atenuados con la leyenda "Partido definido".
También se elige la fecha en que se jugó (por defecto, hoy).

Muestra una vista previa en vivo del cambio de Elo antes de guardar. Al
confirmar, `partidos.js` calcula el ganador, actualiza el Elo y las
estadísticas de los 4 jugadores, y guarda el partido en el historial.

## Editar y borrar partidos — cómo funciona el recálculo

`historial.html` agrupa los partidos por día (más reciente primero) y
cada uno tiene botones "Editar" y "Borrar".

- **Editar** lleva a `cargar.html?editar=<id>` con el formulario
  precargado. Al guardar, el partido se actualiza y queda marcado como
  "editado" (con fecha de edición) para que se note en el historial.
- **Borrar** pide confirmación y elimina el partido.

Ninguna de las dos operaciones ajusta el Elo "a mano": cada vez que se
crea, edita o borra un partido, `recalcularJugadoresDesdeCero()` en
`partidos.js` resetea a todos los jugadores a su Elo inicial y vuelve a
reproducir **todos** los partidos guardados, en orden cronológico (por
fecha del partido y, dentro del mismo día, por cuándo se cargó). Es la
única forma de que el ranking no quede desincronizado al editar o borrar
un partido viejo — con pocos partidos por grupo, recalcular todo es
instantáneo.

## Ranking

La tabla en `index.html` se puede reordenar tocando cualquier
encabezado: Elo, PJ, PG, PP, % Victorias o % Games (un segundo toque
invierte el sentido).

## Próximos pasos sugeridos

- Editar botón/borrar partido cargado por error (hoy no existe).
- Autenticación básica si se quiere evitar que cualquiera cargue partidos.
- Backend real para sincronizar entre dispositivos (ver sección anterior).
- Fotos reales de cada jugador.
