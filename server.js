const room = "sala-global";
const MAX_USERS = 16;
let userCount = 0;
let muted = false;

const partyCount = document.getElementById("partyCount");
const usersDiv = document.getElementById("users");

function updateCount() {
  if (partyCount)
    partyCount.innerText = `Na party (${userCount}/${MAX_USERS})`;
}

const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  alert("Você precisa estar logado");
  location.href = "index.html";
}

let localStream;
let socket = io("https://voice-call-render.onrender.com");
const peers = {};

/* ========================= */
/* 🔥 ADD / REMOVE USERS */
function addUser(id, user) {
  if (document.getElementById(id)) return;

  const div = document.createElement("div");
  div.className = "user";
  div.id = id;

  div.innerHTML = `
    <img src="${user.avatar || "https://i.postimg.cc/1RJ16j43/unifild.webp"}">
    <div class="info">
      <strong>${user.name}</strong>
      <span>Conectado</span>
    </div>
  `;
  usersDiv.appendChild(div);
  userCount++;
  updateCount();
}

function removeUser(id) {
  const el = document.getElementById(id);
  if (el) el.remove();

  const audio = document.getElementById("audio-" + id);
  if (audio) audio.remove();

  delete peers[id];
  userCount = Object.keys(peers).length + (localStream ? 1 : 0);
  updateCount();
}

/* ========================= */
/* 🔥 JOIN / LEAVE / MUTE */
async function joinParty() {
  if (localStream) return;

  try {
    if (window.Android && Android.startVoice) Android.startVoice();

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    socket.emit("join-room", { room, user: { id: user.id, name: user.name, avatar: user.avatar } });

    addUser("me", user);

  } catch (err) {
    alert("Erro ao acessar microfone.");
    console.error(err);
    if (window.Android && Android.stopVoice) Android.stopVoice();
  }
}

function toggleMute(btnEl) {
  if (!localStream) return;

  muted = !muted;
  localStream.getAudioTracks()[0].enabled = !muted;

  const el = btnEl || document.getElementById("navMute");
  if (el) {
    const textEl = el.querySelector("span");
    if (textEl) textEl.innerText = muted ? "Ligar" : "Desligar";
    el.classList.toggle("mic-on", !muted);
    el.classList.toggle("mic-off", muted);
  }

  if (window.Android && Android.toggleMuteNotification) Android.toggleMuteNotification(muted);
}
/* ========================= */
/* 🔥 RESET TOTAL (Visual + Script) */
function leaveParty() {
  // 🔹 Fecha todos os peers
  Object.values(peers).forEach(pc => pc.close());
  Object.keys(peers).forEach(id => {
    const audio = document.getElementById("audio-" + id);
    if (audio) audio.remove();
    delete peers[id];
  });

  // 🔹 Para o microfone
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  // 🔹 Limpa lista de usuários
  usersDiv.innerHTML = "";
  userCount = 0;
  updateCount();

  // 🔹 Reconecta socket
  if (socket) socket.disconnect();
  socket = io("https://voice-call-render.onrender.com");

  // 🔹 Reaplica eventos
  setupSocketEvents();

  // 🔹 Reset botão mute
  muted = false;
  const muteBtn = document.getElementById("navMute");
  if (muteBtn) {
    muteBtn.classList.remove("mic-off");
    muteBtn.classList.add("mic-on");
    const span = muteBtn.querySelector("span");
    if (span) span.innerText = "Desligar";
  }
}

/* ========================= */
/* 🔥 BOTÕES HTML */
document.getElementById("join")?.addEventListener("click", joinParty);
document.getElementById("mute")?.addEventListener("click", e => toggleMute(e.currentTarget));
document.getElementById("leave")?.addEventListener("click", leaveParty);
document.getElementById("navJoin")?.addEventListener("click", joinParty);
document.getElementById("navMute")?.addEventListener("click", e => toggleMute(e.currentTarget));
document.getElementById("navLeave")?.addEventListener("click", leaveParty);

/* ========================= */
/* 🔥 SOCKET EVENTS - isolado para reinicializar */
function setupSocketEvents() {
  socket.on("room-users", users => {
    users.forEach(({ id, user }) => {
      peers[id] = createPeer(id, true);
      addUser(id, user);
    });
  });

  socket.on("user-joined", ({ id, user }) => {
    peers[id] = createPeer(id, false);
    addUser(id, user);
  });

  socket.on("user-left", id => {
    if (peers[id]) peers[id].close();
    delete peers[id];
    removeUser(id);
  });

  socket.on("signal", async data => {
    let pc = peers[data.from];

    if (!pc) {
      pc = createPeer(data.from, false);
      peers[data.from] = pc;
    }

    if (data.signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
      if (data.signal.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: data.from, signal: pc.localDescription });
      }
    } else {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.signal));
      } catch (e) {
        console.error("Erro ICE:", e);
      }
    }
  });
}

/* ========================= */
/* 🔥 PEER DEFINITIVO */
function createPeer(id, caller) {
  if (peers[id]) {
    try { peers[id].close(); } catch(e){}
    delete peers[id];
  }

  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = e => {
    if (e.candidate) socket.emit("signal", { to: id, signal: e.candidate });
  };

  pc.ontrack = e => {
    const oldAudio = document.getElementById("audio-" + id);
    if (oldAudio) oldAudio.remove();

    const audio = document.createElement("audio");
    audio.id = "audio-" + id;
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    audio.playsInline = true;
    audio.muted = false;
    audio.volume = 1;
    document.body.appendChild(audio);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => setTimeout(() => audio.play(), 500));
    }
  };

  pc.onconnectionstatechange = () => {
    if (["failed","disconnected","closed"].includes(pc.connectionState)) {
      pc.close();
      delete peers[id];
      const audio = document.getElementById("audio-" + id);
      if (audio) audio.remove();
    }
  };

  if (caller) {
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .then(() => socket.emit("signal", { to: id, signal: pc.localDescription }));
  }

  return pc;
}

// 🔹 Inicializa eventos na primeira carga
setupSocketEvents();
updateCount();