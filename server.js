const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  socket.on("join-room", ({ room, user }) => {
    socket.join(room);
    socket.user = user;
    socket.room = room;

    // pega quem já está na sala
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, user: s.user };
      });

    // envia a lista para quem entrou
    socket.emit("room-users", clients);

    // avisa os outros da sala
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

  socket.on("disconnect", () => {
    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
    }
    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));