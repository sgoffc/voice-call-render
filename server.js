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
const users = new Map();
// userId -> { socketId, user, room, mutedSelf }

const socketToUser = new Map();
// socketId -> userId

const mutePairs = new Set();
// "a-b"

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
function keyPair(a, b) {
  return [a, b].sort().join("-");
}

/* ========================= */
/* ENVIAR ESTADO COMPLETO DA SALA */
function emitRoomState(room) {
  const roomSockets = io.sockets.adapter.rooms.get(room);
  if (!roomSockets) return;

  const list = Array.from(roomSockets).map((socketId) => {
    const s = io.sockets.sockets.get(socketId);
    const userId = socketToUser.get(socketId);

    return {
      socketId,
      userId,
      user: s?.user || null,
      mutedSelf: s?.mutedSelf || false
    };
  });

  io.to(room).emit("room-users", list);
}

/* ========================= */
io.on("connection", (socket) => {

  socket.mutedSelf = false;

  console.log("connect:", socket.id);

  /* ========================= */
  /* JOIN ROOM */
  socket.on("join-room", ({ room, user }) => {
    if (!room || !user?.id) return;

    const limit = ROOM_LIMITS[room] || 16;

    /* remove duplicado */
    if (users.has(user.id)) {
      const old = users.get(user.id);
      const oldSocket = io.sockets.sockets.get(old.socketId);
      if (oldSocket) oldSocket.disconnect(true);
    }

    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

    if (roomSize >= limit) {
      socket.emit("room-full", { room, limit, current: roomSize });
      return;
    }

    socket.join(room);

    socket.user = user;
    socket.room = room;

    users.set(user.id, {
      socketId: socket.id,
      user,
      room,
      mutedSelf: false
    });

    socketToUser.set(socket.id, user.id);

    emitRoomState(room);

    socket.to(room).emit("user-joined", {
      socketId: socket.id,
      user
    });
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
  /* MUTE ENTRE USUÁRIOS */
  socket.on("toggle-mute-user", ({ targetSocketId }) => {

    const from = socket.id;
    const key = keyPair(from, targetSocketId);

    const target = io.sockets.sockets.get(targetSocketId);
    if (!target) return;

    if (mutePairs.has(key)) {
      mutePairs.delete(key);

      io.to(from).emit("user-unmuted", { targetSocketId });
      io.to(targetSocketId).emit("user-unmuted", { targetSocketId: from });

    } else {
      mutePairs.add(key);

      io.to(from).emit("user-muted", { targetSocketId });
      io.to(targetSocketId).emit("user-muted", { targetSocketId: from });
    }

    emitRoomState(socket.room);
  });

  /* ========================= */
  /* SELF MUTE */
  socket.on("toggle-self-mute", () => {
    socket.mutedSelf = !socket.mutedSelf;

    const userId = socketToUser.get(socket.id);
    if (users.has(userId)) {
      users.get(userId).mutedSelf = socket.mutedSelf;
    }

    emitRoomState(socket.room);

    io.to(socket.room).emit("user-self-mute", {
      socketId: socket.id,
      muted: socket.mutedSelf
    });
  });

  /* ========================= */
  /* DISCONNECT */
  socket.on("disconnect", () => {

    const userId = socketToUser.get(socket.id);

    if (userId) {
      users.delete(userId);
      socketToUser.delete(socket.id);
    }

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
      emitRoomState(socket.room);
    }

    for (const k of mutePairs) {
      if (k.includes(socket.id)) mutePairs.delete(k);
    }

    console.log("disconnect:", socket.id);
  });

});

server.listen(3000, () => {
  console.log("server online");
});