const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔥 Controle global por usuário (evita duplicação de login)
const activeUsers = new Map(); // userId -> socketId

// 🔥 FUNÇÃO CENTRALIZADA PARA EMITIR LISTA REAL DA SALA
function emitRoomUsers(room) {
  const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
    .map(id => {
      const s = io.sockets.sockets.get(id);
      return { id, user: s.user };
    });

  io.to(room).emit("room-users", clients);
}

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  socket.on("join-room", ({ room, user }) => {

    // 🔥 Se usuário já estiver conectado, derruba antigo
    if (activeUsers.has(user.id)) {
      const oldSocketId = activeUsers.get(user.id);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) {
        oldSocket.disconnect(true);
      }
    }

    activeUsers.set(user.id, socket.id);

    socket.join(room);
    socket.user = user;
    socket.room = room;

    // 🔥 Atualiza lista REAL para todos da sala
    emitRoomUsers(room);
  });

  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  socket.on("disconnect", () => {

    // 🔥 Remove do controle global
    if (socket.user && activeUsers.get(socket.user.id) === socket.id) {
      activeUsers.delete(socket.user.id);
    }

    // 🔥 Atualiza lista REAL para todos
    if (socket.room) {
      emitRoomUsers(socket.room);
    }

    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));