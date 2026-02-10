const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// lista de usuários por sala
const rooms = {};

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  socket.on("join-room", (room, user) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, ...user });

    // envia lista completa para todos na sala
    io.to(room).emit("user-list", rooms[room]);
    // avisa que alguém entrou
    socket.to(room).emit("user-joined", { id: socket.id, ...user });
  });

  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  socket.on("leave-room", room => {
    if (rooms[room]) {
      const leavingUser = rooms[room].find(u => u.id === socket.id);
      rooms[room] = rooms[room].filter(u => u.id !== socket.id);
      socket.to(room).emit("user-left", leavingUser);
    }
    socket.leave(room);
  });

  socket.on("disconnect", () => {
    for (const room in rooms) {
      const leavingUser = rooms[room].find(u => u.id === socket.id);
      if (leavingUser) {
        rooms[room] = rooms[room].filter(u => u.id !== socket.id);
        socket.to(room).emit("user-left", leavingUser);
      }
    }
    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));