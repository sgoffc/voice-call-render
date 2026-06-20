const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// =========================
// SALAS (mantidas)
const ROOM_LIMITS = {
  "sala-geral": 16,
  "sala-events": 10,
  "sala-duo": 2,
  "sala-duo2": 2,
  "sala-squad": 4,
  "sala-squad2": 4
};

// =========================
// ESTADO GLOBAL
const users = new Map(); // userId -> socketId

const voiceState = new Map();
/*
socketId => {
  muted: bool,
  deaf: bool,
  serverMuted: bool
}
*/

const permissions = new Map();
/*
userId => role (owner/admin/mod/user)
*/

const privateActions = new Set();
/*
"a-b" mute privado
*/

// =========================

const pair = (a, b) => [a, b].sort().join("-");

function roomCount(room) {
  const r = io.sockets.adapter.rooms.get(room);
  return r ? r.size : 0;
}

// =========================
// PERMISSÕES
// =========================
function getRole(userId) {
  return permissions.get(userId) || "user";
}

function canModerate(role) {
  return role === "owner" || role === "admin" || role === "moderator";
}

// =========================
// SOCKET
// =========================
io.on("connection", (socket) => {

  voiceState.set(socket.id, {
    muted: false,
    deaf: false,
    serverMuted: false
  });

  // =========================
  // JOIN ROOM
  // =========================
  socket.on("join-room", ({ room, user }) => {
    if (!room || !user?.id) return;

    const limit = ROOM_LIMITS[room] || 16;

    if (roomCount(room) >= limit) {
      socket.emit("room-full");
      return;
    }

    socket.join(room);
    socket.user = user;
    socket.room = room;

    users.set(user.id, socket.id);

    const list = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, user: s?.user };
      });

    socket.emit("room-users", list);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });

    io.to(room).emit("room-count", {
      count: roomCount(room),
      limit
    });
  });

  // =========================
  // WEBRTC SIGNAL
  // =========================
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  // =========================
  // 🎧 MUTE PRIVADO
  // =========================
  socket.on("toggle-mute-user", ({ targetId }) => {

    const key = pair(socket.id, targetId);

    if (privateActions.has(key)) {
      privateActions.delete(key);

      io.to(socket.id).emit("mute-update", {
        targetId,
        muted: false
      });

      io.to(targetId).emit("mute-update", {
        targetId: socket.id,
        muted: false
      });

      return;
    }

    privateActions.add(key);

    io.to(socket.id).emit("mute-update", {
      targetId,
      muted: true
    });

    io.to(targetId).emit("mute-update", {
      targetId: socket.id,
      muted: true
    });
  });

  // =========================
  // 🔇 SELF MUTE
  // =========================
  socket.on("self-mute", (state) => {
    const v = voiceState.get(socket.id);
    if (v) v.muted = state;
  });

  // =========================
  // 🛑 SERVER MUTE (PERMISSÃO)
  // =========================
  socket.on("server-mute", ({ targetId, state }) => {

    const requesterRole = getRole(socket.user?.id);

    if (!canModerate(requesterRole)) return;

    const v = voiceState.get(targetId);
    if (!v) return;

    v.serverMuted = state;

    io.to(targetId).emit("server-mute-update", {
      muted: state
    });
  });

  // =========================
  // 🔇 DEAF
  // =========================
  socket.on("deafen", (state) => {
    const v = voiceState.get(socket.id);
    if (v) v.deaf = state;

    socket.emit("deafen-update", { deaf: state });
  });

  // =========================
  // 🎯 AÇÃO GENÉRICA (EXTENSÍVEL)
  // =========================
  socket.on("action", ({ type, payload }) => {

    switch(type) {

      case "kick":
        socket.leave(socket.room);
        socket.emit("kicked");
        break;

      case "set-role":
        permissions.set(payload.userId, payload.role);
        break;

      case "lock-room":
        ROOM_LIMITS[socket.room] = 0;
        break;

    }
  });

  // =========================
  // DISCONNECT
  // =========================
  socket.on("disconnect", () => {

    if (socket.user) {
      users.delete(socket.user.id);
    }

    voiceState.delete(socket.id);

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
      io.to(socket.room).emit("room-count", {
        count: roomCount(socket.room),
        limit: ROOM_LIMITS[socket.room] || 16
      });
    }
  });
});

server.listen(3000, () => {
  console.log("Servidor completo online");
});