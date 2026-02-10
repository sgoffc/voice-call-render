const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {}; // lista de usuários por sala

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  socket.on("join-room", (room, user) => {
    socket.join(room);
    if(!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, ...user });

    // envia lista atualizada para todos na sala
    io.to(room).emit("user-list", rooms[room]);

    // avisa que novo usuário entrou
    socket.to(room).emit("user-joined", { id: socket.id, ...user });
  });

  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  socket.on("leave-room", room => {
    if(rooms[room]){
      rooms[room] = rooms[room].filter(u => u.id !== socket.id);
      socket.to(room).emit("user-left", { id: socket.id });
    }
    socket.leave(room);
  });

  socket.on("disconnect", () => {
    for(const room in rooms){
      const user = rooms[room].find(u=>u.id===socket.id);
      if(user){
        rooms[room] = rooms[room].filter(u=>u.id!==socket.id);
        socket.to(room).emit("user-left", user);
      }
    }
    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log("Servidor online"));