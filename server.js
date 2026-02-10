const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  // ENTRAR NA SALA (mesma lógica, só passa user)
  socket.on("join-room", ({ room, user }) => {
    socket.join(room);

    // guarda o usuário no socket
    socket.user = user;

    // avisa os outros da sala QUEM entrou
    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });
  });

  // WEBRTC SIGNAL (NÃO ALTERADO)
  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  // QUANDO SAI
  socket.on("disconnect", () => {
    if (socket.user) {
      socket.broadcast.emit("user-left", socket.id);
    }
    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor online");
});