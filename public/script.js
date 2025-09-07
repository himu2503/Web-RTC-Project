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
let myStream = null;
let peer = null;
const peers = {}; // map peerId -> call

// socket.io connection
const socket = io("/");

// Utility helpers
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

// Join flow: when user types name and clicks Join
joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  MY_NAME = name;
  joinModal.style.display = "none";
  startMediaAndJoin();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

// copy link button
copyLinkBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyLinkBtn.textContent = "Link Copied!";
    setTimeout(() => (copyLinkBtn.textContent = "Copy Link"), 1500);
  } catch (err) {
    console.warn("copy failed", err);
  }
});

// Chat send
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  // emit raw text; server attaches name
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

// Core: get media, create Peer, wire handlers and join room
async function startMediaAndJoin() {
  try {
    // 1) get camera/mic
    myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log("Got local stream");

    // show self immediately
    const myVideo = document.createElement("video");
    myVideo.muted = true;
    addVideoStream(myVideo, myStream, MY_NAME, "user-self");

    // 2) create Peer *after* media is ready (avoids open-event race)
    peer = new Peer(undefined, {
      host: location.hostname,
      port: location.port || (location.protocol === "https:" ? 443 : 80),
      secure: location.protocol === "https:",
      path: "/"
    });

    // Answer incoming calls
    peer.on("call", (call) => {
      console.log("Incoming call from", call.peer, "metadata:", call.metadata);
      call.answer(myStream);
      const video = document.createElement("video");
      const callerName = call.metadata?.userName || "Guest";
      call.on("stream", (remoteStream) => {
        addVideoStream(video, remoteStream, callerName, `user-${call.peer}`);
      });
      // store so we can close it later
      peers[call.peer] = call;
      call.on("close", () => {
        removeVideoById(`user-${call.peer}`);
      });
    });

    // When Peer is ready, emit join to server
    peer.on("open", (id) => {
      console.log("Peer open with id:", id);
      socket.emit("join-room", { roomId: ROOM_ID, peerId: id, name: MY_NAME });
    });

    peer.on("error", (err) => console.error("Peer error:", err));
    peer.on("disconnected", () => console.warn("Peer disconnected"));

    // 3) socket handlers (these are safe to attach now)
    socket.on("user-connected", ({ userId, name }) => {
      console.log("socket: user-connected", userId, name);
      // small delay to give the remote peer a moment to be ready
      setTimeout(() => {
        if (!peers[userId]) {
          connectToNewUser(userId, myStream, name);
        }
      }, 250);
    });

    socket.on("user-disconnected", ({ userId }) => {
      console.log("socket: user-disconnected", userId);
      if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
      }
      removeVideoById(`user-${userId}`);
    });

    socket.on("createMessage", (payload) => {
      console.log("chat msg recv:", payload);
      appendMessage(payload);
    });

  } catch (err) {
    console.error("startMediaAndJoin error:", err);
    alert("Could not access camera/microphone. Check permissions and try again.");
  }
}

function connectToNewUser(userId, stream, remoteName) {
  if (!peer) {
    console.warn("Peer not ready yet, cannot call", userId);
    return;
  }
  console.log("Calling new user:", userId, "remoteName:", remoteName);
  const call = peer.call(userId, stream, { metadata: { userName: MY_NAME } });
  const video = document.createElement("video");

  call.on("stream", (remoteStream) => {
    addVideoStream(video, remoteStream, remoteName, `user-${userId}`);
  });

  call.on("close", () => {
    removeVideoById(`user-${userId}`);
  });

  call.on("error", (err) => console.error("call error:", err));

  peers[userId] = call;
}
