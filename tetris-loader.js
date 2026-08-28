/*
 * Loader de carga estilo Tetris (adaptado a JS vanilla, sin React/Tailwind).
 * Un bot juega una partida completa mientras la página y sus videos cargan;
 * al terminar (o tras un máximo de espera) el overlay se desvanece.
 * Basado en el algoritmo original de "loader-tetris" (21st.dev).
 */
(function () {
    "use strict";

    var COLUMNS = 8;
    var ROWS = 16;
    var SPEED_MS = 40;
    var FALL_STEP = 2; // filas que avanza una pieza por frame al caer
    var MIN_SHOW_MS = 1400;
    var MAX_SHOW_MS = 6000;

    /* ---------------------------- generación de frames ---------------------------- */

    var SHAPES = [
        { id: 1, rot: [[[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]]] }, // I
        { id: 2, rot: [[[0, 0], [1, 0], [0, 1], [1, 1]]] }, // O
        { id: 3, rot: [[[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]]] }, // T
        { id: 4, rot: [[[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]]] }, // S
        { id: 5, rot: [[[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [0, 1], [1, 1], [0, 2]]] }, // Z
        { id: 6, rot: [[[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]]] }, // J
        { id: 7, rot: [[[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]], [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]]] }  // L
    ];

    var PIECES = SHAPES.map(function (shape) {
        return {
            id: shape.id,
            rot: shape.rot.map(function (cells) {
                var left = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
                var top = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
                return cells.map(function (c) { return [c[0] - left, c[1] - top]; });
            })
        };
    });

    function hits(board, cells, ox, oy, w, h) {
        for (var i = 0; i < cells.length; i++) {
            var x = ox + cells[i][0];
            var y = oy + cells[i][1];
            if (x < 0 || x >= w || y >= h) return true;
            if (y >= 0 && board[y * w + x]) return true;
        }
        return false;
    }

    function fall(board, cells, ox, from, w, h) {
        var y = from;
        while (!hits(board, cells, ox, y + 1, w, h)) y++;
        return y;
    }

    function stamp(board, cells, ox, oy, id, w) {
        var next = board.slice();
        for (var i = 0; i < cells.length; i++) {
            var y = oy + cells[i][1];
            if (y >= 0) next[y * w + ox + cells[i][0]] = id;
        }
        return next;
    }

    function fullRows(board, w, h) {
        var rows = [];
        for (var r = 0; r < h; r++) {
            var full = true;
            for (var c = 0; c < w; c++) {
                if (!board[r * w + c]) { full = false; break; }
            }
            if (full) rows.push(r);
        }
        return rows;
    }

    function collapse(board, rows, w, h) {
        var kept = [];
        for (var r = 0; r < h; r++) {
            if (rows.indexOf(r) !== -1) continue;
            kept.push(board.slice(r * w, r * w + w));
        }
        var next = new Array((h - kept.length) * w).fill(0);
        kept.forEach(function (row) { next.push.apply(next, row); });
        return next;
    }

    function rate(board, lines, w, h) {
        var heights = [];
        var holes = 0;
        for (var c = 0; c < w; c++) {
            var top = h;
            for (var r = 0; r < h; r++) {
                if (board[r * w + c]) { top = r; break; }
            }
            heights.push(h - top);
            for (var r2 = top + 1; r2 < h; r2++) if (!board[r2 * w + c]) holes++;
        }
        var stack = 0, bumps = 0;
        for (var c2 = 0; c2 < w; c2++) {
            stack += heights[c2];
            if (c2) bumps += Math.abs(heights[c2] - heights[c2 - 1]);
        }
        return -0.51 * stack + 0.76 * lines - 0.36 * holes - 0.18 * bumps;
    }

    function moves(board, piece, w, h) {
        var out = [];
        for (var r = 0; r < piece.rot.length; r++) {
            var cells = piece.rot[r];
            var span = Math.max.apply(null, cells.map(function (c) { return c[0]; }));
            for (var x = 0; x + span < w; x++) {
                var y = fall(board, cells, x, -4, w, h);
                var landed = stamp(board, cells, x, y, piece.id, w);
                var lines = fullRows(landed, w, h);
                out.push({ rot: r, x: x, y: y, value: rate(collapse(landed, lines, w, h), lines.length, w, h) });
            }
        }
        out.sort(function (a, b) { return b.value - a.value; });
        return out;
    }

    function bag() {
        var order = [0, 1, 2, 3, 4, 5, 6];
        for (var i = order.length - 1; i > 0; i--) {
            var j = (Math.random() * (i + 1)) | 0;
            var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }
        return order;
    }

    function generateTetrisFrames(w, h) {
        var cells = w * h;
        var frames = [];
        var board = new Array(cells).fill(0);
        var queue = [];
        var placed = 0;
        var alive = true;

        while (alive && placed < 60 && frames.length < 900) {
            if (!queue.length) queue = bag();
            var piece = PIECES[queue.shift()];
            var spots = moves(board, piece, w, h);
            if (!spots.length) break;

            var slip = Math.max(0, placed - 10) * 0.06;
            var spot = spots[Math.random() < slip ? Math.min(spots.length - 1, 1 + ((Math.random() * 2) | 0)) : 0];
            var shape = piece.rot[spot.rot];
            var tall = Math.max.apply(null, shape.map(function (c) { return c[1]; })) + 1;

            for (var y = -tall; y < spot.y; y += FALL_STEP) {
                if (y + tall <= 0) continue;
                frames.push(stamp(board, shape, spot.x, y, piece.id, w));
            }
            frames.push(stamp(board, shape, spot.x, spot.y, piece.id, w));

            board = stamp(board, shape, spot.x, spot.y, piece.id, w);
            if (shape.some(function (c) { return spot.y + c[1] < 0; })) alive = false;

            var rows = fullRows(board, w, h);
            if (rows.length) {
                var flash = board.slice();
                rows.forEach(function (r) {
                    for (var c = 0; c < w; c++) flash[r * w + c] = 8;
                });
                frames.push(flash, board.slice(), flash);
                board = collapse(board, rows, w, h);
                frames.push(board.slice(), board.slice());
            }

            placed++;
        }

        var flood = board.slice();
        for (var r3 = h - 1; r3 >= 0; r3--) {
            for (var c3 = 0; c3 < w; c3++) flood[r3 * w + c3] = 9;
            frames.push(flood.slice());
        }
        var empty = new Array(cells).fill(0);
        frames.push(flood.slice(), empty.slice(), flood.slice(), empty.slice(), empty.slice());

        return frames;
    }

    /* ---------------------------- montaje del loader ---------------------------- */

    function init() {
        var overlay = document.getElementById("loader-overlay");
        var grid = document.getElementById("tetris-grid");
        if (!overlay || !grid) return;

        var dots = [];
        for (var i = 0; i < COLUMNS * ROWS; i++) {
            var dot = document.createElement("div");
            dot.className = "tetris-cell";
            grid.appendChild(dot);
            dots.push(dot);
        }

        var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        function cellColor(value) {
            if (!value) return "";
            if (value === 8) return "var(--tetris-flash)";
            if (value === 9) return "var(--tetris-dead)";
            return "var(--tetris-" + value + ")";
        }

        function paint(board) {
            for (var i = 0; i < dots.length; i++) {
                dots[i].style.backgroundColor = cellColor(board[i] || 0);
            }
        }

        var game = generateTetrisFrames(COLUMNS, ROWS);
        var frameIndex = 0;
        var rafId = null;

        if (reducedMotion) {
            paint(game[Math.floor(game.length * 0.55)]);
        } else {
            var last = performance.now();
            var owed = 0;

            var tick = function (now) {
                owed += now - last;
                last = now;
                if (owed > SPEED_MS * 4) owed = SPEED_MS;

                while (owed >= SPEED_MS) {
                    owed -= SPEED_MS;
                    frameIndex++;
                    if (frameIndex >= game.length) {
                        game = generateTetrisFrames(COLUMNS, ROWS);
                        frameIndex = 0;
                    }
                }

                paint(game[Math.min(frameIndex, game.length - 1)]);
                rafId = requestAnimationFrame(tick);
            };

            rafId = requestAnimationFrame(tick);
        }

        var startedAt = Date.now();
        var hidden = false;

        function hide() {
            if (hidden) return;
            hidden = true;

            var elapsed = Date.now() - startedAt;
            var wait = Math.max(0, MIN_SHOW_MS - elapsed);

            // El juego sigue animando durante la espera y todo el fade;
            // solo se detiene justo cuando el overlay se quita del DOM.
            setTimeout(function () {
                overlay.classList.add("loader-hidden");

                var stop = function () {
                    if (rafId) cancelAnimationFrame(rafId);
                    overlay.remove();
                };

                overlay.addEventListener("transitionend", stop, { once: true });
                // Respaldo por si transitionend no dispara (pestaña oculta, etc.)
                setTimeout(stop, 800);
            }, wait);
        }

        window.addEventListener("load", hide);
        setTimeout(hide, MAX_SHOW_MS);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
