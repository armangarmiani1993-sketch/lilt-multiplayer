"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Server } = require("socket.io");

const html = fs.readFileSync(
  path.join(__dirname, "public", "index.html")
);

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
  }

  if (pathname !== "/" && pathname !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  res.end(html);
});

const io = new Server(server, {
  maxHttpBufferSize: 10000
});

/*
 * Original fictional placeholders.
 * These are NOT representations of traditional mythology.
 * Replace these entries with your own characters and stories.
 */
const CHARACTERS = [
  {
    id: "dawn",
    symbol: "☀",
    name: ["Dawn Weaver", "Tisserand de l’aube"],
    lore: [
      "The Dawn Weaver stitches a small opening in the night, just wide enough for a new beginning.",
      "Le Tisserand de l’aube ouvre une petite brèche dans la nuit, juste assez grande pour un nouveau départ."
    ]
  },
  {
    id: "moon",
    symbol: "☾",
    name: ["Moon Gardener", "Jardinier de la lune"],
    lore: [
      "The Moon Gardener tends flowers that bloom only when nobody asks them to hurry.",
      "Le Jardinier de la lune cultive des fleurs qui s’ouvrent seulement quand personne ne leur demande de se dépêcher."
    ]
  },
  {
    id: "river",
    symbol: "≈",
    name: ["River Listener", "Écouteur du fleuve"],
    lore: [
      "The River Listener keeps the stories that travellers are not ready to tell aloud.",
      "L’Écouteur du fleuve garde les histoires que les voyageurs ne sont pas encore prêts à raconter."
    ]
  },
  {
    id: "mountain",
    symbol: "△",
    name: ["Mountain Lantern", "Lanterne des montagnes"],
    lore: [
      "The Mountain Lantern lights the next step, never demanding that anyone see the whole path.",
      "La Lanterne des montagnes éclaire le prochain pas, sans demander de voir tout le chemin."
    ]
  },
  {
    id: "mirror",
    symbol: "◇",
    name: ["Mirror Keeper", "Gardien du miroir"],
    lore: [
      "The Mirror Keeper offers a reflection without a verdict.",
      "Le Gardien du miroir offre un reflet sans jugement."
    ]
  },
  {
    id: "wind",
    symbol: "≋",
    name: ["Wind Courier", "Messager du vent"],
    lore: [
      "The Wind Courier carries handwritten welcomes between distant homes.",
      "Le Messager du vent transporte des mots de bienvenue entre des maisons éloignées."
    ]
  },
  {
    id: "star",
    symbol: "✦",
    name: ["Star Cartographer", "Cartographe des étoiles"],
    lore: [
      "The Star Cartographer draws maps with room for routes nobody has imagined yet.",
      "Le Cartographe des étoiles dessine des cartes où restent possibles des chemins encore inconnus."
    ]
  },
  {
    id: "seed",
    symbol: "❋",
    name: ["Seed Guardian", "Gardien des graines"],
    lore: [
      "The Seed Guardian knows that quiet things can still be growing.",
      "Le Gardien des graines sait que même les choses silencieuses peuvent grandir."
    ]
  }
];

const SETTINGS = [
  ["The Garden Gate", "La porte du jardin"],
  ["The Lantern Courtyard", "La cour des lanternes"],
  ["The House of Small Stars", "La maison des petites étoiles"]
];

const rooms = new Map();
const MAX_ROOMS = 300;
const ROOM_TTL = 2 * 60 * 60 * 1000;

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from(
      { length: 6 },
      () => alphabet[crypto.randomInt(alphabet.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  if (typeof value !== "string") return "Guest";
  return value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24)
    || "Guest";
}

function online(room) {
  return room.players.filter(p => p.socketId);
}

function newBoard() {
  const board = CHARACTERS.flatMap(c => [c.id, c.id]);
  for (let i = board.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

function clearRoomTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function startRound(room) {
  clearRoomTimer(room);
  room.board = newBoard();
  room.open = [];
  room.matched = [];
  room.busy = false;
  room.lastLore = null;
  room.phase = "playing";

  const players = online(room);
  const starter = players[(room.round - 1) % players.length];
  room.turn = room.players.indexOf(starter);
}

function nextTurn(room) {
  for (let step = 1; step <= room.players.length; step++) {
    const index = (room.turn + step) % room.players.length;
    if (room.players[index].socketId) {
      room.turn = index;
      return;
    }
  }
}

function currentHost(room) {
  return online(room)[0]?.id || null;
}

function publicState(room) {
  const visible = new Set([...room.open, ...room.matched]);

  return {
    code: room.code,
    revision: room.revision,
    phase: room.phase,
    round: room.round,
    setting: SETTINGS[Math.max(0, room.round - 1)],
    hostId: currentHost(room),
    turnId: room.players[room.turn]?.id || null,
    busy: room.busy,
    onlineCount: online(room).length,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: Boolean(p.socketId),
      score: p.score
    })),
    tiles: room.board.map((id, index) => {
      const character = CHARACTERS.find(c => c.id === id);
      return {
        index,
        matched: room.matched.includes(index),
        character: visible.has(index) ? {
          symbol: character.symbol,
          name: character.name
        } : null
      };
    }),
    lastLore: room.lastLore,
    restartVotes: [...room.restartVotes],
    winners: room.phase === "finished"
      ? room.players
          .filter(p => p.score === Math.max(
            ...room.players.map(player => player.score)
          ))
          .map(p => p.id)
      : []
  };
}

function broadcast(room) {
  room.revision++;
  room.touched = Date.now();
  io.to(room.code).emit("state", publicState(room));
}

function membership(socket) {
  const room = rooms.get(socket.data.code);
  const player = room?.players.find(
    p => p.id === socket.data.playerId && p.socketId === socket.id
  );
  return player ? { room, player } : null;
}

function attach(socket, room, player) {
  const oldId = player.socketId;

  player.socketId = socket.id;
  socket.data.code = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);

  if (oldId && oldId !== socket.id) {
    const old = io.sockets.sockets.get(oldId);
    if (old) {
      old.emit("replaced");
      old.disconnect(true);
    }
  }
}

function reply(callback, value) {
  if (typeof callback === "function") callback(value);
}

function fail(callback, error) {
  reply(callback, { ok: false, error });
}

io.on("connection", socket => {
  let requests = [];

  function allowed(callback) {
    const now = Date.now();
    requests = requests.filter(t => now - t < 10000);
    if (requests.length >= 60) {
      fail(callback, "slow");
      return false;
    }
    requests.push(now);
    return true;
  }

  socket.on("create", (data = {}, callback) => {
    if (!allowed(callback)) return;
    if (membership(socket)) return fail(callback, "already");
    if (rooms.size >= MAX_ROOMS) return fail(callback, "capacity");

    const player = {
      id: randomToken().slice(0, 16),
      token: randomToken(),
      name: cleanName(data.name),
      socketId: null,
      score: 0
    };

    const room = {
      code: roomCode(),
      players: [player],
      phase: "lobby",
      round: 0,
      turn: 0,
      board: [],
      open: [],
      matched: [],
      busy: false,
      revision: 0,
      timer: null,
      lastLore: null,
      restartVotes: new Set(),
      touched: Date.now()
    };

    rooms.set(room.code, room);
    attach(socket, room, player);

    reply(callback, {
      ok: true, code: room.code,
      id: player.id, token: player.token
    });
    broadcast(room);
  });

  socket.on("join", (data = {}, callback) => {
    if (!allowed(callback)) return;
    if (membership(socket)) return fail(callback, "already");

    const code = String(data.code || "").trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) return fail(callback, "missing");
    if (room.phase !== "lobby") return fail(callback, "started");
    if (room.players.length >= 8) return fail(callback, "full");

    const player = {
      id: randomToken().slice(0, 16),
      token: randomToken(),
      name: cleanName(data.name),
      socketId: null,
      score: 0
    };

    room.players.push(player);
    attach(socket, room, player);

    reply(callback, {
      ok: true, code, id: player.id, token: player.token
    });
    broadcast(room);
  });

  socket.on("resume", (data = {}, callback) => {
    if (!allowed(callback)) return;

    const room = rooms.get(String(data.code || "").toUpperCase());
    const player = room?.players.find(p => p.token === data.token);

    if (!room || !player) return fail(callback, "expired");
    attach(socket, room, player);
    reply(callback, {
      ok: true, code: room.code,
      id: player.id, token: player.token
    });
    broadcast(room);
  });

  socket.on("start", (data = {}, callback) => {
    if (!allowed(callback)) return;
    const member = membership(socket);
    if (!member) return fail(callback, "expired");

    const { room, player } = member;

    if (room.phase !== "lobby") return fail(callback, "started");
    if (currentHost(room) !== player.id) return fail(callback, "host");
    if (online(room).length < 2) return fail(callback, "two");

    // Before the game starts, discard abandoned lobby seats.
    room.players = room.players.filter(p => p.socketId);
    room.round = 1;
    startRound(room);
    broadcast(room);
    reply(callback, { ok: true });
  });

  socket.on("flip", (data = {}, callback) => {
    if (!allowed(callback)) return;
    const member = membership(socket);
    if (!member) return fail(callback, "expired");

    const { room, player } = member;

    if (room.phase !== "playing") return fail(callback, "phase");
    if (online(room).length < 2) return fail(callback, "two");
    if (room.players[room.turn]?.id !== player.id)
      return fail(callback, "turn");
    if (room.busy) return fail(callback, "busy");
    if (data.revision !== room.revision)
      return fail(callback, "stale");

    const index = data.index;
    if (!Number.isInteger(index) || index < 0 || index >= 16)
      return fail(callback, "tile");
    if (room.open.includes(index) || room.matched.includes(index))
      return fail(callback, "tile");

    room.open.push(index);

    if (room.open.length === 2) {
      const [a, b] = room.open;

      if (room.board[a] === room.board[b]) {
        player.score++;
        room.matched.push(a, b);
        const character = CHARACTERS.find(c => c.id === room.board[a]);
        room.lastLore = {
          name: character.name,
          text: character.lore
        };
        room.open = [];

        if (room.matched.length === 16) {
          room.phase = room.round === 3 ? "finished" : "between";
        } else {
          nextTurn(room);
        }
      } else {
        room.busy = true;
        room.timer = setTimeout(() => {
          room.timer = null;
          room.open = [];
          room.busy = false;
          nextTurn(room);
          broadcast(room);
        }, 1400);
      }
    }

    broadcast(room);
    reply(callback, { ok: true });
  });

  socket.on("next", (data = {}, callback) => {
    if (!allowed(callback)) return;
    const member = membership(socket);
    if (!member) return fail(callback, "expired");
    const { room, player } = member;

    if (currentHost(room) !== player.id) return fail(callback, "host");
    if (room.phase !== "between") return fail(callback, "phase");
    if (online(room).length < 2) return fail(callback, "two");

    room.round++;
    startRound(room);
    broadcast(room);
    reply(callback, { ok: true });
  });

  socket.on("skip", (data = {}, callback) => {
    if (!allowed(callback)) return;
    const member = membership(socket);
    if (!member) return fail(callback, "expired");
    const { room } = member;

    if (room.phase !== "playing" || room.busy)
      return fail(callback, "phase");
    if (room.players[room.turn]?.socketId)
      return fail(callback, "online");
    if (online(room).length < 2) return fail(callback, "two");

    room.open = [];
    nextTurn(room);
    broadcast(room);
    reply(callback, { ok: true });
  });

  socket.on("restart", (data = {}, callback) => {
    if (!allowed(callback)) return;
    const member = membership(socket);
    if (!member) return fail(callback, "expired");
    const { room, player } = member;

    if (room.phase !== "finished") return fail(callback, "phase");
    room.restartVotes.add(player.id);

    // All original players must consent, including disconnected seats.
    if (room.restartVotes.size === room.players.length &&
        online(room).length >= 2) {
      room.players.forEach(p => { p.score = 0; });
      room.restartVotes.clear();
      room.round = 1;
      startRound(room);
    }

    broadcast(room);
    reply(callback, { ok: true });
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;

    const player = room.players.find(
      p => p.id === socket.data.playerId && p.socketId === socket.id
    );
    if (!player) return;

    player.socketId = null;
    broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > ROOM_TTL) {
      clearRoomTimer(room);
      io.to(code).emit("expired");
      io.in(code).disconnectSockets(true);
      rooms.delete(code);
    }
  }
}, 60000).unref();

const port = Number(process.env.PORT) || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Lilt server listening on port ${port}`);
});