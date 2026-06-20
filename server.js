const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ========================= */
/* ESTADO GLOBAL */
const activeUsers = new Map(); 
// userId -> { socketId, room, user }

const socketToUser = new Map();
// socketId -> userId

const blockedPairs = new Set();

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

/* ========================= */
/* SALAS */
const ROOM_LIMITS = {
  "sala-geral": 16,
  "sala-events": 10,
  "sala-duo": 2,
  "sala-duo2": 2,
  "sala-squad": 4,
  "sala-squad2": 4
};

/* ========================= */
/* ENVIAR LISTA ATUALIZADA DA SALA (🔥 NOVO CORE) */
function broadcastRoomUsers(room) {
  const roomSockets = io.sockets.adapter.rooms.get(room);

  if (!roomSockets) return;

  const users = Array.from(roomSockets).map(socketId => {
    const s = io.sockets.sockets.get(socketId);
    return {
      socketId,
      user: s?.user || null,
      muted: s?.muted || false
    };
  });

  io.to(room).emit("room-users", users);
}

/* ========================= */
io.on("connection", socket => {

  socket.muted = false;

  console.log("Conectou:", socket.id);

  /* ========================= */
  /* JOIN ROOM (REFORÇADO MAS MESMA LÓGICA) */
  socket.on("join-room", ({ room, user }) => {

    const limit = ROOM_LIMITS[room] || 16;

    if (!room || !user?.id) return;

    /* remove login duplicado */
    if (activeUsers.has(user.id)) {
      const old = activeUsers.get(user.id);
      const oldSocket = io.sockets.sockets.get(old.socketId);
      if (oldSocket) oldSocket.disconnect(true);
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

    socket.join(room);
    socket.user = user;
    socket.room = room;

    activeUsers.set(user.id, {
      socketId: socket.id,
      room,
      user
    });

    socketToUser.set(socket.id, user.id);

    /* 🔥 IMPORTANTE: envia lista atualizada PRA TODOS */
    broadcastRoomUsers(room);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });

    console.log(`User ${user.name} entrou em ${room}`);
  });

  /* ========================= */
  /* SIGNAL WEBRTC (mantido) */
  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  /* ========================= */
  /* MUTE REAL MELHORADO */
  socket.on("toggle-mute-user", ({ targetId }) => {

    const from = socket.id;
    const key = pairKey(from, targetId);

    const targetSocket = io.sockets.sockets.get(targetId);

    if (!targetSocket) return;

    const isMuted = blockedPairs.has(key);

    if (isMuted) {
      blockedPairs.delete(key);

      io.to(from).emit("user-unmuted", { targetId });
      io.to(targetId).emit("user-unmuted", { targetId: from });

    } else {
      blockedPairs.add(key);

      io.to(from).emit("user-muted", { targetId });
      io.to(targetId).emit("user-muted", { targetId: from });
    }

    /* 🔥 atualiza UI de todos */
    const room = socket.room;
    if (room) broadcastRoomUsers(room);
  });

  /* ========================= */
  /* MUTE GLOBAL (NOVO) */
  socket.on("toggle-self-mute", () => {
    socket.muted = !socket.muted;

    const room = socket.room;
    if (room) broadcastRoomUsers(room);

    io.to(room).emit("user-self-mute", {
      socketId: socket.id,
      muted: socket.muted
    });
  });

  /* ========================= */
  /* DISCONNECT (REFORÇADO) */
  socket.on("disconnect", () => {

    const userId = socketToUser.get(socket.id);

    if (userId) {
      activeUsers.delete(userId);
      socketToUser.delete(socket.id);
    }

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
      broadcastRoomUsers(socket.room);
    }

    for (const key of blockedPairs) {
      if (key.includes(socket.id)) {
        blockedPairs.delete(key);
      }
    }

    console.log("Saiu:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Servidor online");
});