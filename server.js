const express = require("express");
const http = require("http");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { ExpressPeerServer } = require("peer");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, { cors: { origin: "*" } });

// Views & static
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// PeerJS signaling server, mounted at /peerjs
const peerServer = ExpressPeerServer(server, { debug: true, path: "/" });
app.use("/peerjs", peerServer);

// Routes
app.get("/", (_req, res) => res.render("index"));
app.get("/new", (_req, res) => res.redirect(`/${uuidv4()}`));
app.get("/:room", (req, res) => res.render("room", { roomId: req.params.room }));

// Socket.IO: rooms + chat + lifecycle
io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, peerId, name }) => {
    socket.join(roomId);
    socket.data = { roomId, peerId, name };

    // notify others that a new user joined
    socket.to(roomId).emit("user-connected", { userId: peerId, name });

    // chat
    socket.on("message", (text) => {
      io.to(roomId).emit("createMessage", { name, text });
    });

    socket.on("disconnect", () => {
      const { roomId, peerId } = socket.data || {};
      if (roomId && peerId) {
        socket.to(roomId).emit("user-disconnected", { userId: peerId });
      }
    });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`✅ PeerJS signaling mounted at /peerjs`);
});
