// DOM
const videoGrid = document.getElementById("video-grid");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const muteBtn = document.getElementById("mute-btn");
const cameraBtn = document.getElementById("camera-btn");
const copyLinkBtn = document.getElementById("copy-link");

const joinModal = document.getElementById("join-modal");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");

let MY_NAME = "";
let myStream;
const peers = {}; // userId -> call

// Socket & Peer
const socket = io("/");

// PeerJS client points to the same origin where /peerjs is mounted
const peer = new Peer(undefined, {
  host: location.hostname,
  port: location.port || (location.protocol === "https:" ? 443 : 80),
  secure: location.protocol === "https:",
  path: "/peerjs"
});

// Helpers
function addVideoStream(video, stream, name, containerId) {
  const card = document.createElement("div");
  card.className = "video-card";
  if (containerId) card.id = containerId;

  video.srcObject = stream;
  video.playsInline = true;
  video.addEventListener("loadedmetadata", () => video.play());

  const tag = document.createElement("div");
  tag.className = "name-tag";
  tag.textContent = name || "User";

  card.appendChild(video);
  card.appendChild(tag);
  videoGrid.appendChild(card);
}

function removeVideoById(id) {
  const el = document.getElementById(id);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function appendMessage({ name, text }) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<span class="from">${name}:</span> <span>${text}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Name modal -> start
joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  MY_NAME = name;
  joinModal.style.display = "none";
  startMediaAndJoin();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

// Copy link
copyLinkBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyLinkBtn.textContent = "Link Copied!";
    setTimeout(() => (copyLinkBtn.textContent = "Copy Link"), 1500);
  } catch {}
});

// Chat
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("message", text);
  chatInput.value = "";
});

// Controls
muteBtn.addEventListener("click", () => {
  const enabled = myStream?.getAudioTracks()[0]?.enabled;
  if (enabled === undefined) return;
  myStream.getAudioTracks()[0].enabled = !enabled;
  muteBtn.textContent = enabled ? "Unmute" : "Mute";
});

cameraBtn.addEventListener("click", () => {
  const enabled = myStream?.getVideoTracks()[0]?.enabled;
  if (enabled === undefined) return;
  myStream.getVideoTracks()[0].enabled = !enabled;
  cameraBtn.textContent = enabled ? "Camera On" : "Camera Off";
});

// Core
function startMediaAndJoin() {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
      myStream = stream;

      // Show self
      const myVideo = document.createElement("video");
      myVideo.muted = true;
      addVideoStream(myVideo, stream, MY_NAME, "user-self");

      // Answer incoming calls
      peer.on("call", (call) => {
        call.answer(stream);
        const video = document.createElement("video");
        const callerName = call.metadata?.userName || "Guest";
        call.on("stream", (remoteStream) => {
          addVideoStream(video, remoteStream, callerName, `user-${call.peer}`);
        });
      });

      // When PeerJS ready, announce to room via Socket.IO
      peer.on("open", (id) => {
        socket.emit("join-room", { roomId: ROOM_ID, peerId: id, name: MY_NAME });
      });

      // New user joined (socket)
      socket.on("user-connected", ({ userId, name }) => {
        connectToNewUser(userId, stream, name);
      });

      // Remote leaves
      socket.on("user-disconnected", ({ userId }) => {
        if (peers[userId]) peers[userId].close();
        removeVideoById(`user-${userId}`);
      });

      // Chat broadcast from server
      socket.on("createMessage", (payload) => appendMessage(payload));
    })
    .catch((err) => {
      alert("Could not access camera/microphone. Check browser permissions.");
      console.error(err);
    });
}

function connectToNewUser(userId, stream, remoteName) {
  const call = peer.call(userId, stream, { metadata: { userName: MY_NAME } });
  const video = document.createElement("video");

  call.on("stream", (remoteStream) => {
    addVideoStream(video, remoteStream, remoteName, `user-${userId}`);
  });

  call.on("close", () => removeVideoById(`user-${userId}`));

  peers[userId] = call;
}
