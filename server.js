const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ========================= */
/* SALAS (FONTE ÚNICA) */
const ROOMS = {
  "sala-geral": { limit: 16, password: null },
  "sala-events": { limit: 10, password: "123456" },
  "sala-duo": { limit: 2, password: null },
  "sala-duo2": { limit: 2, password: null },
  "sala-squad": { limit: 4, password: null },
  "sala-squad2": { limit: 4, password: null },
  "sala-squad3": { limit: 4, password: null },
  "sala-sgoffc": { limit: 10, password: "sgoffc" }
};

/* ========================= */
/* ESTADOS */
const activeUsers = new Map(); // user.id -> socket.id
const blockedPairs = new Set();

/* ========================= */
function pairKey(a, b) {
  return [a, b].sort().join("-");
}

/* ========================= */
/* SOCKET */
io.on("connection", (socket) => {
  console.log("Conectou:", socket.id);

  /* envia config para frontend */
  socket.emit("room-config", ROOMS);

  /* ========================= */
  /* JOIN ROOM */
  socket.on("join-room", ({ room, password, user }) => {

    const config = ROOMS[room];

    if (!config) {
      socket.emit("join-error", "Sala inexistente");
      return;
    }

    /* senha */
    if (config.password && config.password !== password) {
      socket.emit("join-error", "Senha incorreta!");
      return;
    }

    /* limite */
    const roomSet = io.sockets.adapter.rooms.get(room);
    const roomSize = roomSet ? roomSet.size : 0;

    if (roomSize >= config.limit) {
      socket.emit("room-full", {
        room,
        limit: config.limit,
        current: roomSize
      });
      return;
    }

    /* remove duplicado (mesmo usuário em outro socket) */
    if (activeUsers.has(user.id)) {
      const oldSocketId = activeUsers.get(user.id);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) oldSocket.disconnect(true);
    }

    activeUsers.set(user.id, socket.id);

    socket.join(room);
    socket.user = user;
    socket.room = room;

    /* lista atual da sala */
    const clients = Array.from(io.sockets.sockets.values())
      .filter(s => s.room === room && s.user)
      .map(s => ({
        id: s.id,
        user: s.user
      }));

    socket.emit("room-users", clients);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });
  });

  /* ========================= */
  /* MUTE (BIDIRECIONAL) */
  socket.on("toggle-mute-user", ({ targetId }) => {

    const from = socket.id;
    const key = pairKey(from, targetId);

    const isBlocked = blockedPairs.has(key);

    if (isBlocked) {
      blockedPairs.delete(key);

      io.to(from).emit("user-unmuted", { targetId });
      io.to(targetId).emit("user-unmuted", { targetId: from });

    } else {
      blockedPairs.add(key);

      io.to(from).emit("user-muted", { targetId });
      io.to(targetId).emit("user-muted", { targetId: from });
    }
  });

  /* ========================= */
  /* SIGNAL (WEBRTC) */
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  /* ========================= */
  /* DISCONNECT */
  socket.on("disconnect", () => {

    console.log("Saiu:", socket.id);

    /* remove do activeUsers */
    if (socket.user) {
      activeUsers.delete(socket.user.id);
    }

    /* avisa sala */
    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
    }

    /* limpa bloqueios */
    for (const key of blockedPairs) {
      if (key.includes(socket.id)) {
        blockedPairs.delete(key);
      }
    }
  });
});

/* ========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online na porta", PORT));