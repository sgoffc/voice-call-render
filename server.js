const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ========================= */
const ROOM_LIMITS = {
  "sala-geral": 16,
  "sala-events": 10,
  "sala-duo": 2,
  "sala-duo2": 2,
  "sala-squad": 4,
  "sala-squad2": 4
};

/* ========================= */
/* STATE */
const activeUsers = new Map(); // userId -> { socketId, room }
const privateMutes = new Map(); // "a-b" -> true

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

function emitRoomCount(room) {
  const roomSet = io.sockets.adapter.rooms.get(room);
  const count = roomSet ? roomSet.size : 0;

  io.to(room).emit("room-count", {
    room,
    count,
    limit: ROOM_LIMITS[room] || 16
  });
}

function removeAllMutes(userId) {
  for (const [key, data] of privateMutes) {
    if (key.includes(userId)) {
      privateMutes.delete(key);
    }
  }
}

/* ========================= */
io.on("connection", (socket) => {

  socket.on("join-room", ({ room, user }) => {
    if (!room || !user?.id) return;

    const limit = ROOM_LIMITS[room] || 16;

    // remove duplicado
    if (activeUsers.has(user.id)) {
      const old = activeUsers.get(user.id);
      io.sockets.sockets.get(old.socketId)?.disconnect(true);
    }

    const roomSet = io.sockets.adapter.rooms.get(room);
    const size = roomSet ? roomSet.size : 0;

    if (size >= limit) {
      socket.emit("room-full", { room, limit, current: size });
      return;
    }

    socket.join(room);

    socket.user = user;
    socket.room = room;

    activeUsers.set(user.id, {
      socketId: socket.id,
      room
    });

    // lista usuários
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return { id: s?.user?.id || id, user: s?.user };
      });

    socket.emit("room-users", clients);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });

    emitRoomCount(room);
  });

  /* ========================= */
  socket.on("signal", ({ to, signal }) => {
    io.to(to).emit("signal", {
      from: socket.id,
      signal
    });
  });

  /* ========================= */
  socket.on("toggle-mute-user", ({ targetId }) => {
    if (!socket.user) return;

    const ownerId = socket.user.id;
    const key = pairKey(ownerId, targetId);

    const target = activeUsers.get(targetId);
    if (!target) return;

    if (privateMutes.has(key)) {
      privateMutes.delete(key);

      io.to(socket.id).emit("user-unmuted", { targetId, ownerId });
      io.to(target.socketId).emit("user-unmuted", { targetId: ownerId, ownerId });

      return;
    }

    privateMutes.set(key, true);

    io.to(socket.id).emit("user-muted", { targetId, ownerId });
    io.to(target.socketId).emit("user-muted", { targetId: ownerId, ownerId });
  });

  /* ========================= */
  socket.on("disconnect", () => {
    if (socket.user) {
      activeUsers.delete(socket.user.id);
      removeAllMutes(socket.user.id);
    }

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
      emitRoomCount(socket.room);
    }
  });
});

server.listen(3000, () => {
  console.log("Servidor online");
});