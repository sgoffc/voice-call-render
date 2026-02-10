
Search within code
 
‎server.js‎
Original file line number	Diff line number	Diff line change
@@ -6,41 +6,51 @@ const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
  cors: { origin: "*" }
});

// 🔹 estado simples das salas
const rooms = {};
io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  // ENTRAR NA SALA (mesma lógica, só passa user)
  socket.on("join-room", ({ room, user }) => {
    socket.join(room);

    // guarda o usuário no socket
    socket.user = user;
    socket.room = room;
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, user });
    // ✅ ENVIA LISTA COMPLETA PARA TODOS
    io.to(room).emit("room-users", rooms[room]);

    // avisa os outros da sala QUEM entrou
    // mantém compatibilidade com tua lógica
    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });
  });

  // WEBRTC SIGNAL (NÃO ALTERADO)
  // WEBRTC SIGNAL — NÃO ALTERADO
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
    const room = socket.room;
    if (!room || !rooms[room]) return;
    rooms[room] = rooms[room].filter(u => u.id !== socket.id);
    // ✅ ATUALIZA LISTA DA SALA
    io.to(room).emit("room-users", rooms[room]);
    console.log("Saiu:", socket.id);
  });
});