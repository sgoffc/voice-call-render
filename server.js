const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// =========================
// SALAS (mantido igual ao seu sistema)
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
const users = new Map(); 
// userId -> socketId

const voiceState = new Map();
// socketId -> { muted, deaf, serverMuted }

const privateMute = new Set();
// "a-b"

const key = (a, b) => [a, b].sort().join("-");

function roomCount(room) {
  const r = io.sockets.adapter.rooms.get(room);
  return r ? r.size : 0;
}

function emitRoomState(room) {
  io.to(room).emit("room-count", {
    count: roomCount(room),
    limit: ROOM_LIMITS[room] || 16
  });
}

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

    const peers = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, user: s?.user };
      });

    socket.emit("room-users", peers);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });

    emitRoomState(room);
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
  // 🎧 MUTE PRIVADO (A → B)
  // =========================
  socket.on("toggle-mute-user", ({ targetId }) => {

    const k = key(socket.id, targetId);

    if (privateMute.has(k)) {
      privateMute.delete(k);

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

    privateMute.add(k);

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
    if (!v) return;
    v.muted = state;
  });

  // =========================
  // 🛑 SERVER MUTE (admin system básico)
  // =========================
  socket.on("server-mute", ({ targetId, state }) => {
    const v = voiceState.get(targetId);
    if (!v) return;

    v.serverMuted = state;

    io.to(targetId).emit("server-mute-update", {
      muted: state
    });
  });

  // =========================
  // 🔇 DEAF (não ouve ninguém)
  // =========================
  socket.on("deafen", (state) => {
    const v = voiceState.get(socket.id);
    if (!v) return;
    v.deaf = state;

    socket.emit("deafen-update", { deaf: state });
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
      emitRoomState(socket.room);
    }
  });
});

server.listen(3000, () => {
  console.log("Voice server online");
});