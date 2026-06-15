const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔥 controle de usuário ativo
const activeUsers = new Map(); // userId -> socketId

// 🔥 NOVO: bloqueios entre usuários (bidirecional)
const blockedPairs = new Set();

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  socket.on("join-room", ({ room, user, limit }) => {

    if (activeUsers.has(user.id)) {
      const oldSocketId = activeUsers.get(user.id);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) oldSocket.disconnect(true);
    }

    // 🔥 conta usuários na sala
    const roomSet = io.sockets.adapter.rooms.get(room);
    const roomSize = roomSet ? roomSet.size : 0;

    // 🔥 limite vem do frontend (EndFonte)
    const roomLimit = limit || 16;

    if (roomSize >= roomLimit) {
      socket.emit("room-full", {
        room,
        limit: roomLimit
      });
      return;
    }

    activeUsers.set(user.id, socket.id);

    socket.join(room);
    socket.user = user;
    socket.room = room;

    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, user: s.user };
      });

    socket.emit("room-users", clients);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });
  });

  // 🔥 SIGNAL WebRTC (inalterado)
  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  // ================================
  // 🔥 MUTE BIDIRECIONAL
  // ================================
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