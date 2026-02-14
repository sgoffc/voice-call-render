const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔥 Controle global por usuário
const activeUsers = new Map(); // userId -> socketId

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  socket.on("join-room", ({ room, user }) => {

    // 🔥 Se usuário já estiver conectado, derruba antigo
    if (activeUsers.has(user.id)) {
      const oldSocketId = activeUsers.get(user.id);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket && oldSocket.id !== socket.id) {
        oldSocket.emit("force-leave"); // 👈 Notifica o antigo para sair da call
        oldSocket.disconnect(true);
      }
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

  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  // 🔹 Evento específico para sair da call sem desconectar todo o socket
  socket.on("leave-room", () => {
    if (socket.room && socket.user) {
      socket.to(socket.room).emit("user-left", socket.id);
      activeUsers.delete(socket.user.id);
      socket.leave(socket.room);
      socket.room = null;
    }
  });

  socket.on("disconnect", () => {
    if (socket.user && activeUsers.get(socket.user.id) === socket.id) {
      activeUsers.delete(socket.user.id);
    }

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
    }

    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));