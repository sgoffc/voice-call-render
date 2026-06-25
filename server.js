const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ========================= */
/* CONTROLE DE USUĆRIOS */
const activeUsers = new Map();

/* ========================= */
/* BLOQUEIO (mantido original) */
const blockedPairs = new Set();

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

/* ========================= */
/* SALAS COM LIMITE (FONTE ĆNICA REAL) */
const ROOM_PASSWORDS = {
  "sala-events": "123456",
  "sala-duo": "duo123",
  "sala-duo2": "duo456",
  "sala-squad": "squad123",
  "sala-squad2": "squad456"
};

const ROOM_LIMITS = {
  "sala-geral": 16,
  "sala-events": 10,
  "sala-duo": 2,
  "sala-duo2": 2,
  "sala-squad": 4,
  "sala-squad2": 4
};
io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  /* ========================= */
  /* JOIN ROOM (CORRIGIDO DE VERDADE) */
socket.on("join-room", ({ room, password, user }) => {

  const roomPassword = ROOM_PASSWORDS[room];

  if (roomPassword && password !== roomPassword) {
    socket.emit("join-error", "Senha incorreta!");
    return;
  }

  const limit = ROOM_LIMITS[room] || 16;

  if (activeUsers.has(user.id)) {
    const oldSocketId = activeUsers.get(user.id);
    const oldSocket = io.sockets.sockets.get(oldSocketId);

    if (oldSocket) {
      oldSocket.disconnect(true);
    }
  }

  const roomSet = io.sockets.adapter.rooms.get(room);
  const roomSize = roomSet ? roomSet.size : 0;

  if (roomSize >= limit) {
    socket.emit("room-full", {
      room,
      limit,
      current: roomSize
    });

    return;
  }

  activeUsers.set(user.id, socket.id);

  socket.join(room);
  socket.user = user;
  socket.room = room;

    /* lista usuĆ�rios atuais */
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, user: s?.user };
      });

    socket.emit("room-users", clients);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });

    console.log(`User ${user.name} entrou em ${room} (${roomSize + 1}/${limit})`);
  });

  /* ========================= */
  /* SIGNAL WEBRTC (INALTERADO) */
  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  /* ========================= */
  /* MUTE BIDIRECIONAL (INALTERADO) */
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
  /* DISCONNECT */
  socket.on("disconnect", () => {

    if (socket.user && activeUsers.get(socket.user.id) === socket.id) {
      activeUsers.delete(socket.user.id);
    }

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
    }

    for (const key of blockedPairs) {
      if (key.includes(socket.id)) {
        blockedPairs.delete(key);
      }
    }

    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));