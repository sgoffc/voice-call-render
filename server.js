const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ========================= */
/* CONTROLE DE USUÁRIOS */
const activeUsers = new Map();

/* ========================= */
/* BLOQUEIO (mantido original) */
const blockedPairs = new Set();

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

/* ========================= */
/* SALAS COM LIMITE */
const ROOM_LIMITS = {
  "sala-geral": 16,
  "sala-events": 10,
  "sala-duo": 2,
  "sala-duo2": 2,
  "sala-squad": 4,
  "sala-squad2": 4
};

/* ========================= */
/* 🎧 SISTEMA DE MÚSICA POR SALA */
const roomMusic = new Map();

function getMusicRoom(room) {
  if (!roomMusic.has(room)) {
    roomMusic.set(room, {
      hostId: null,
      botActive: false,
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

io.on("connection", socket => {
  console.log("Conectou:", socket.id);

  /* ========================= */
  /* JOIN ROOM */
  socket.on("join-room", ({ room, user }) => {

    const limit = ROOM_LIMITS[room] || 16;

    if (activeUsers.has(user.id)) {
      const oldSocketId = activeUsers.get(user.id);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) oldSocket.disconnect(true);
    }

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
  /* SIGNAL WEBRTC */
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
  /* 🤖 BOT SPAWN */
  socket.on("bot:spawn", ({ room }) => {
    const state = getMusicRoom(room);

    if (state.botActive) {
      socket.emit("bot:error", { message: "Bot já ativo" });
      return;
    }

    state.botActive = true;
    state.hostId = socket.id;

    io.to(room).emit("bot:spawned", {
      hostId: socket.id
    });
  });

  /* ========================= */
  /* 🚪 BOT LEAVE */
  socket.on("bot:leave", ({ room }) => {
    const state = getMusicRoom(room);

    if (state.hostId !== socket.id) return;

    state.botActive = false;
    state.hostId = null;
    state.music.isPlaying = false;

    io.to(room).emit("bot:left");
  });

  /* ========================= */
  /* 🎵 SET MUSIC */
  socket.on("music:set", ({ room, url }) => {
    const state = getMusicRoom(room);

    if (state.hostId !== socket.id) return;

    state.music.url = url;

    io.to(room).emit("music:set", { url });
  });

  /* ========================= */
  /* ▶️ PLAY */
  socket.on("music:play", ({ room }) => {
    const state = getMusicRoom(room);

    if (state.hostId !== socket.id) return;

    state.music.isPlaying = true;
    state.music.startedAt = Date.now();

    io.to(room).emit("music:play", {
      url: state.music.url,
      startTimestamp: state.music.startedAt,
      volume: state.music.volume
    });
  });

  /* ========================= */
  /* ⏸️ PAUSE */
  socket.on("music:pause", ({ room }) => {
    const state = getMusicRoom(room);

    if (state.hostId !== socket.id) return;

    state.music.isPlaying = false;

    io.to(room).emit("music:pause");
  });

  /* ========================= */
  /* 🔊 VOLUME */
  socket.on("music:volume", ({ room, volume }) => {
    const state = getMusicRoom(room);

    if (state.hostId !== socket.id) return;

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

      const state = roomMusic.get(socket.room);

      if (state && state.hostId === socket.id) {
        state.botActive = false;
        state.hostId = null;

        socket.to(socket.room).emit("bot:left");
      }
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