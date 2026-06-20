const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ========================= */
/* USUÁRIOS */
const activeUsers = new Map();

/* ========================= */
/* BLOQUEIO */
const blockedPairs = new Set();

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

/* ========================= */
/* SALAS */
const ROOM_LIMITS = {
  "sala-geral": 16,
  "sala-events": 10,
  "sala-duo": 2,
  "sala-duo2": 2,
  "sala-squad": 4,
  "sala-squad2": 4
};

/* ========================= */
/* 🎧 ESTADO DE MÚSICA POR SALA */
const roomMusic = new Map();

function getRoom(room) {
  if (!roomMusic.has(room)) {
    roomMusic.set(room, {
      hostId: null,
      music: {
        url: "",
        isPlaying: false,
        startedAt: 0,
        volume: 1
      }
    });
  }
  return roomMusic.get(room);
}

/* ========================= */
io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  /* ========================= */
  /* JOIN ROOM (SÓ QUANDO FRONT CHAMAR) */
  socket.on("join-room", ({ room, user }) => {

    const limit = ROOM_LIMITS[room] || 16;

    const roomSet = io.sockets.adapter.rooms.get(room);
    const roomSize = roomSet ? roomSet.size : 0;

    if (roomSize >= limit) {
      socket.emit("room-full", { room, limit, current: roomSize });
      return;
    }

    activeUsers.set(user.id, socket.id);

    socket.join(room);
    socket.user = user;
    socket.room = room;

    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, user: s?.user };
      });

    socket.emit("room-users", clients);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      user
    });

    console.log(`User ${user.name} entrou em ${room}`);
  });

  /* ========================= */
  /* SIGNAL */
  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  /* ========================= */
  /* MUTE */
  socket.on("toggle-mute-user", ({ targetId }) => {
    const from = socket.id;
    const key = pairKey(from, targetId);

    const isBlocked = blockedPairs.has(key);

    if (isBlocked) {
      blockedPairs.delete(key);
      io.to(from).emit("user-unmuted", { targetId });
      io.to(targetId).emit("user-unmuted", { targetId: from });
    } else {
      blockedPairs.add(key);
      io.to(from).emit("user-muted", { targetId });
      io.to(targetId).emit("user-muted", { targetId: from });
    }
  });

  /* ========================= */
  /* 🤖 BOT (OPCIONAL, NÃO OBRIGATÓRIO) */
  socket.on("bot:spawn", ({ room }) => {
    const state = getRoom(room);

    if (!state.hostId) {
      state.hostId = socket.id;
    }

    io.to(room).emit("bot:spawned", {
      hostId: state.hostId
    });
  });

  socket.on("bot:leave", ({ room }) => {
    const state = getRoom(room);

    if (state.hostId === socket.id) {
      state.hostId = null;
    }

    io.to(room).emit("bot:left");
  });

  /* ========================= */
  /* 🎵 MÚSICA (SEM BLOQUEIO DE HOST) */

  socket.on("music:set", ({ room, url }) => {
    const state = getRoom(room);

    state.music.url = url;

    io.to(room).emit("music:set", { url });
  });

  socket.on("music:play", ({ room }) => {
    const state = getRoom(room);

    state.music.isPlaying = true;
    state.music.startedAt = Date.now();

    io.to(room).emit("music:play", {
      url: state.music.url,
      startTimestamp: state.music.startedAt,
      volume: state.music.volume
    });
  });

  socket.on("music:pause", ({ room }) => {
    const state = getRoom(room);

    state.music.isPlaying = false;

    io.to(room).emit("music:pause");
  });

  socket.on("music:volume", ({ room, volume }) => {
    const state = getRoom(room);

    state.music.volume = volume;

    io.to(room).emit("music:volume", { volume });
  });

  /* ========================= */
  /* DISCONNECT */
  socket.on("disconnect", () => {

    if (socket.user && activeUsers.get(socket.user.id) === socket.id) {
      activeUsers.delete(socket.user.id);
    }

    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
    }

    for (const key of blockedPairs) {
      if (key.includes(socket.id)) {
        blockedPairs.delete(key);
      }
    }

    console.log("Saiu:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Servidor online"));