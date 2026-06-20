const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ========================= */
/* ROOMS */
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
const activeUsers = new Map(); // userId -> socketId
const privateMutes = new Map();

/* ========================= */
function pairKey(a, b) {
  return [a, b].sort().join("-");
}

/* ========================= */
function emitRoomCount(room) {
  const roomSet = io.sockets.adapter.rooms.get(room);
  const count = roomSet ? roomSet.size : 0;

  io.to(room).emit("room-count", {
    room,
    count,
    limit: ROOM_LIMITS[room] || 16
  });
}

/* ========================= */
function removeAllMutes(userId) {
  for (const [key, data] of privateMutes) {
    if (data.userA === userId || data.userB === userId) {
      privateMutes.delete(key);
    }
  }
}

/* ========================= */

io.on("connection", (socket) => {
  console.log("Conectou:", socket.id);

  /* ========================= */
  /* JOIN */
  socket.on("join-room", ({ room, user }) => {
    if (!room || !user?.id) return;

    const limit = ROOM_LIMITS[room] || 16;

    /* remove duplicado */
    if (activeUsers.has(user.id)) {
      const oldSocketId = activeUsers.get(user.id);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) oldSocket.disconnect(true);
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

    activeUsers.set(user.id, socket.id);

    /* lista usuários */
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter((id) => id !== socket.id)
      .map((id) => {
        const s = io.sockets.sockets.get(id);
        return { id, user: s?.user };
      });

    socket.emit("room-users", clients);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });

    emitRoomCount(room);
  });

  /* ========================= */
  /* SIGNAL WEBRTC (CORRIGIDO + ROBUSTO) */
  socket.on("signal", async ({ to, signal }) => {
    io.to(to).emit("signal", {
      from: socket.id,
      signal
    });
  });

  /* ========================= */
  /* MUTE */
  socket.on("toggle-mute-user", ({ targetId }) => {
    if (!socket.user) return;

    const ownerId = socket.user.id;
    const key = pairKey(ownerId, targetId);

    const existing = privateMutes.get(key);

    if (existing && existing.ownerId === ownerId) {
      privateMutes.delete(key);

      io.to(socket.id).emit("user-unmuted", {
        targetId,
        ownerId
      });

      const other = activeUsers.get(targetId);
      if (other) {
        io.to(other.socketId).emit("user-unmuted", {
          targetId: ownerId,
          ownerId
        });
      }

      return;
    }

    const target = activeUsers.get(targetId);
    if (!target) return;

    privateMutes.set(key, {
      ownerId,
      userA: ownerId,
      userB: targetId
    });

    io.to(socket.id).emit("user-muted", {
      targetId,
      ownerId,
      canUnmute: true
    });

    io.to(target.socketId).emit("user-muted", {
      targetId: ownerId,
      ownerId,
      canUnmute: false
    });
  });

  /* ========================= */
  /* DISCONNECT */
  socket.on("disconnect", () => {
    if (socket.user) {
      activeUsers.delete(socket.user.id);
      removeAllMutes(socket.user.id);
    }

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
      emitRoomCount(socket.room);
    }

    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));