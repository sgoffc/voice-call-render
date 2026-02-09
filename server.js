const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

io.on("connection", socket => {
  console.log("Usuário conectado:", socket.id);

  socket.on("join-room", room => {
    socket.join(room);
    socket.to(room).emit("user-joined", socket.id);
  });

  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
