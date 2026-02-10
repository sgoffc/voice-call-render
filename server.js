const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔹 estado simples das salas
const rooms = {};

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  socket.on("join-room", ({ room, user }) => {
    socket.join(room);

    socket.user = user;
    socket.room = room;

    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, user });

    // ✅ ENVIA LISTA COMPLETA PARA TODOS
    io.to(room).emit("room-users", rooms[room]);

    // mantém compatibilidade com tua lógica
    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });
  });

  // WEBRTC SIGNAL — NÃO ALTERADO
  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  socket.on("disconnect", () => {
    const room = socket.room;
    if (!room || !rooms[room]) return;

    rooms[room] = rooms[room].filter(u => u.id !== socket.id);

    // ✅ ATUALIZA LISTA DA SALA
    io.to(room).emit("room-users", rooms[room]);

    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor online");
});