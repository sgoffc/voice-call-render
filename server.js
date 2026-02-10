const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// Lista de usuários por sala
const rooms = {};

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  // Entrar na sala
  socket.on("join-room", (room, user) => {
    socket.join(room);
    socket.user = user; // guarda os dados do usuário
    if(!rooms[room]) rooms[room] = {};
    rooms[room][socket.id] = user;

    // Envia lista completa para o novo usuário
    socket.emit("user-list", Object.values(rooms[room]));

    // Notifica os outros que entrou
    socket.to(room).emit("user-joined", user);
  });

  // Sinal WebRTC
  socket.on("signal", data => {
    io.to(data.to).emit("signal", { from: socket.id, signal: data.signal });
  });

  // Sair da call
  socket.on("leave-room", (room) => {
    if(rooms[room] && rooms[room][socket.id]){
      delete rooms[room][socket.id];
      socket.to(room).emit("user-left", socket.user);
    }
  });

  // Desconexão
  socket.on("disconnect", () => {
    for(const room in rooms){
      if(rooms[room][socket.id]){
        const user = rooms[room][socket.id];
        delete rooms[room][socket.id];
        socket.to(room).emit("user-left", user);
      }
    }
    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));