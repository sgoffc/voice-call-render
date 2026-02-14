const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const rooms = {}; // { roomName: { [socket.id]: userObject } }

io.on("connection", socket => {
  console.log("Usuário conectado:", socket.id);

  /* ========================= */
  /* 🔹 JOIN ROOM */
  socket.on("join-room", ({ room, user }) => {
    socket.join(room);

    // Cria room se não existir
    if (!rooms[room]) rooms[room] = {};
    rooms[room][socket.id] = user;

    // Dispara lista de usuários atuais
    const usersInRoom = Object.entries(rooms[room]).map(([id, user]) => ({ id, user }));
    io.to(room).emit("room-users", usersInRoom);

    // Notifica os outros que entrou
    socket.to(room).emit("user-joined", { id: socket.id, user });

    console.log(`Usuário ${user.name} entrou na sala ${room}`);
  });

  /* ========================= */
  /* 🔹 SIGNAL (WebRTC) */
  socket.on("signal", data => {
    const { to, signal } = data;
    io.to(to).emit("signal", { from: socket.id, signal });
  });

  /* ========================= */
  /* 🔹 LEAVE ROOM / DISCONNECT */
  function leaveRoom() {
    for (const roomName of Object.keys(socket.rooms)) {
      if (roomName === socket.id) continue; // Ignora sala individual do socket

      if (rooms[roomName] && rooms[roomName][socket.id]) {
        const user = rooms[roomName][socket.id];
        delete rooms[roomName][socket.id];

        // Notifica os outros que saiu
        socket.to(roomName).emit("user-left", socket.id);

        // Atualiza lista de usuários
        const usersInRoom = Object.entries(rooms[roomName]).map(([id, user]) => ({ id, user }));
        io.to(roomName).emit("room-users", usersInRoom);

        console.log(`Usuário ${user.name} saiu da sala ${roomName}`);
      }
    }
  }

  socket.on("disconnecting", leaveRoom);
  socket.on("leave-room", leaveRoom);

  /* ========================= */
  /* 🔹 LOG */
  socket.on("disconnect", () => {
    console.log("Usuário desconectado:", socket.id);
  });
});

/* ========================= */
/* 🔹 SERVE STATIC FILES */
app.use(express.static("public"));

/* ========================= */
/* 🔹 START SERVER */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));