const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 100000, // 100 seconds
  pingInterval: 35000, // 35 seconds
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/test", (req, res) => {
  res.send("king!");
});

// --- GAME STATE ---
const games = {};

function generateId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("=================================");
  console.log("✅ NEW CONNECTION:", socket.id);
  console.log("=================================");

  socket.emit("test", "Hello from server!");

  socket.on("joinGame", (data) => {
    console.log("=================================");
    console.log("📥 RECEIVED joinGame event");
    console.log("Data:", data);
    console.log("Socket ID:", socket.id);
    console.log("=================================");

    try {
      const { gameId, name, type, startingMoney, bankBalance } = data;

      if (!name || !name.trim()) {
        console.log("❌ No name provided");
        socket.emit("error", "Name is required");
        return;
      }

      let finalGameId = gameId;

      // If hosting, create new game OR rejoin existing
      if (type === "host") {
        if (!gameId) {
          // Creating NEW game
          finalGameId = generateId();
          console.log("🎮 Creating new game:", finalGameId);

          games[finalGameId] = {
            id: finalGameId,
            hostSocketId: socket.id,
            hostName: name.trim(),
            status: "lobby",
            startingBalance: parseInt(startingMoney) || 1500,
            bankBalance: parseInt(bankBalance) || 10000,
            players: [],
            logs: [],
            requests: {},
            countdownTimer: null,
            lastTransaction: null,
            bankStats: {
              totalReceived: 0,
              totalPaid: 0,
              receivedFrom: {},
              paidTo: {}
            }
          };
          console.log("✅ Game created successfully");
        } else {
          // Rejoining existing game as host
          console.log("🔄 Host attempting to rejoin game:", finalGameId);

          if (!games[finalGameId]) {
            console.log("❌ Game no longer exists on server");
            socket.emit(
              "error",
              "Game no longer exists. Please start a new game."
            );
            return;
          }

          // Update host socket ID for rejoin
          games[finalGameId].hostSocketId = socket.id;
          console.log("✅ Host rejoined successfully");
        }

        const game = games[finalGameId];
        socket.join(finalGameId);

        // Send host response
        // Send host response
        socket.emit("gameJoined", {
          gameId: finalGameId,
          isHost: true,
          name: name.trim(),
          status: game.status,
          bankBalance: game.bankBalance,
        });

        io.to(finalGameId).emit("updatePlayerList", game.players);
        io.to(finalGameId).emit("updateLogs", game.logs);

        socket.emit("bankStatsUpdate", game.bankStats);

        if (game.lastTransaction) {
          socket.emit("enableUndo");
          console.log("✅ Undo button enabled for rejoining host");
        }

        if (game.status === "lobby") {
          game.logs.unshift({
            msg: `Bank is ${gameId ? "back managing" : "managing"} the game`,
            time: Date.now(),
          });
          io.to(finalGameId).emit("updateLogs", game.logs);
        }

        console.log("✅ Host join completed");
        console.log("=================================");
        return;
      }

      // REGULAR PLAYER LOGIC (only if not host)
      const game = games[finalGameId];
      if (!game) {
        console.log("❌ Game not found:", finalGameId);
        socket.emit("error", "Game not found");
        return;
      }

      console.log("✅ Game found:", finalGameId, "Status:", game.status);
      socket.join(finalGameId);

      // REGULAR PLAYER LOGIC
      let player = game.players.find(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase()
      );

      if (player) {
        // REJOIN
        console.log("🔄 Player rejoining:", name);
        player.socketId = socket.id;
        player.active = true;

        socket.emit("gameJoined", {
          gameId: finalGameId,
          isHost: false,
          name: player.name,
          status: game.status,
          balance: player.balance,
        });

        if (game.status === "active") {
          socket.emit("gameStateActive", { balance: player.balance });
        }

        if (socket.id === game.hostSocketId) {
          socket.emit("bankBalanceUpdate", game.bankBalance);
        }

        game.logs.unshift({
          msg: `${player.name} rejoined`,
          time: Date.now(),
        });
      } else {
        // NEW PLAYER
        console.log("👤 Adding new player:", name);

        if (game.status !== "lobby") {
          console.log("❌ Game already started");
          socket.emit("error", "Game already in progress");
          return;
        }

        player = {
          socketId: socket.id,
          name: name.trim(),
          balance: game.startingBalance,
          isHost: false,
          isReady: false,
          active: true,
          requestsMade: [],
        };

        game.players.push(player);
        console.log("✅ Player added. Total players:", game.players.length);

        socket.emit("gameJoined", {
          gameId: finalGameId,
          isHost: false,
          name: player.name,
          status: game.status,
          balance: player.balance,
        });

        game.logs.unshift({
          msg: `${player.name} joined the game`,
          time: Date.now(),
        });
      }

      io.to(finalGameId).emit("updatePlayerList", game.players);
      io.to(finalGameId).emit("updateLogs", game.logs);

      socket.emit("bankStatsUpdate", game.bankStats);

      console.log("✅ Join process completed successfully");
      console.log("=================================");
    } catch (error) {
      console.error("❌ ERROR in joinGame:", error);
      console.error("Stack:", error.stack);
      socket.emit("error", "Server error occurred");
    }
  });

  // --- KICK PLAYER (FIXED) ---
  socket.on("kickPlayer", ({ gameId, playerName }) => {
    console.log("🚫 Kick request for:", playerName, "in game:", gameId);
    const game = games[gameId];
    if (!game) {
      console.log("❌ Game not found");
      return;
    }

    if (socket.id !== game.hostSocketId) {
      console.log("❌ Non-host tried to kick");
      return socket.emit("error", "Only host can kick players");
    }

    const playerToKick = game.players.find((p) => p.name === playerName);
    if (!playerToKick) {
      console.log("❌ Player not found");
      return;
    }

    console.log(
      "✅ Kicking player:",
      playerName,
      "Socket:",
      playerToKick.socketId
    );

    // Remove player from game
    game.players = game.players.filter((p) => p.name !== playerName);

    // Force disconnect the kicked player's socket
    const kickedSocket = io.sockets.sockets.get(playerToKick.socketId);
    if (kickedSocket) {
      kickedSocket.emit("kicked");
      kickedSocket.leave(gameId);
      console.log("✅ Socket kicked and removed from room");
    }

    // Add log
    game.logs.unshift({
      msg: `${playerName} was kicked from the game`,
      time: Date.now(),
    });

    // Clear any active countdown if in lobby
    if (game.countdownTimer) {
      clearTimeout(game.countdownTimer);
      game.countdownTimer = null;
      io.to(gameId).emit("cancelCountdown");
    }

    // Update all remaining players
    io.to(gameId).emit("updatePlayerList", game.players);
    io.to(gameId).emit("updateLogs", game.logs);

    console.log("✅ Kick completed. Remaining players:", game.players.length);
  });

  // --- LEAVE LOBBY ---
  socket.on("leaveLobby", ({ gameId, playerName }) => {
    console.log("👋 Leave lobby request for:", playerName, "in game:", gameId);
    const game = games[gameId];
    if (!game) {
      console.log("❌ Game not found");
      return;
    }

    // Remove player from game
    game.players = game.players.filter((p) => p.name !== playerName);

    // Add log
    game.logs.unshift({
      msg: `${playerName} left the lobby`,
      time: Date.now(),
    });

    // Clear any active countdown if in lobby
    if (game.countdownTimer) {
      clearTimeout(game.countdownTimer);
      game.countdownTimer = null;
      io.to(gameId).emit("cancelCountdown");
    }

    // Update all remaining players
    io.to(gameId).emit("updatePlayerList", game.players);
    io.to(gameId).emit("updateLogs", game.logs);

    console.log("✅ Leave completed. Remaining players:", game.players.length);
  });

  // --- REQUEST GAME STATE (for reconnection) ---
socket.on("requestGameState", ({ gameId, name }) => {
  console.log("📥 Game state request from:", name, "for game:", gameId);
  const game = games[gameId];
  
  if (!game) {
    console.log("❌ Game not found");
    return socket.emit("error", "Game not found");
  }
  
  // Check if this is the host
  const isHostUser = game.hostName.toLowerCase() === name.toLowerCase();
  
  if (isHostUser) {
    // Update host socket ID
    game.hostSocketId = socket.id;
    socket.join(gameId);
    
    socket.emit("gameJoined", {
      gameId: gameId,
      isHost: true,
      name: name,
      status: game.status,
      bankBalance: game.bankBalance,
    });
    
    io.to(gameId).emit("updatePlayerList", game.players);
    io.to(gameId).emit("updateLogs", game.logs);
    socket.emit("bankStatsUpdate", game.bankStats);
    
    if (game.lastTransaction) {
      socket.emit("enableUndo");
    }
  } else {
    // Regular player
    const player = game.players.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    
    if (!player) {
      console.log("❌ Player not found in game");
      return socket.emit("error", "You are not in this game");
    }
    
    // Update player socket ID
    player.socketId = socket.id;
    player.active = true;
    socket.join(gameId);
    
    socket.emit("gameJoined", {
      gameId: gameId,
      isHost: false,
      name: player.name,
      status: game.status,
      balance: player.balance,
    });
    
    if (game.status === "active") {
      socket.emit("gameStateActive", { balance: player.balance });
    }
    
    io.to(gameId).emit("updatePlayerList", game.players);
    io.to(gameId).emit("updateLogs", game.logs);
    socket.emit("bankStatsUpdate", game.bankStats);
  }
  
  console.log("✅ Game state sent successfully");
});

  socket.on("toggleReady", ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    player.isReady = !player.isReady;
    io.to(gameId).emit("updatePlayerList", game.players);

    game.logs.unshift({
      msg: `${player.name} is ${player.isReady ? "Ready" : "Not Ready"}`,
      time: Date.now(),
    });
    io.to(gameId).emit("updateLogs", game.logs);

    const allReady =
      game.players.length > 0 && game.players.every((p) => p.isReady);

    if (allReady && game.status === "lobby") {
      // Cancel any existing countdown
      if (game.countdownTimer) {
        clearTimeout(game.countdownTimer);
      }

      game.logs.unshift({
        msg: "Everyone is ready. Game starts in 5 seconds",
        time: Date.now(),
      });
      io.to(gameId).emit("updateLogs", game.logs);
      io.to(gameId).emit("startCountdown");

      game.countdownTimer = setTimeout(() => {
        if (game.status === "lobby") {
          game.status = "active";
          game.logs = []; // CLEAR ALL LOBBY LOGS
          game.logs.unshift({ msg: "🎮 Game Started!", time: Date.now() });
          io.to(gameId).emit("startGame");
          io.to(gameId).emit("updateLogs", game.logs);
          game.countdownTimer = null;
        }
      }, 5000);
    } else if (!allReady && game.status === "lobby" && game.countdownTimer) {
      // Someone clicked not ready, cancel countdown
      clearTimeout(game.countdownTimer);
      game.countdownTimer = null;
      io.to(gameId).emit("cancelCountdown");
      game.logs.unshift({
        msg: "Countdown cancelled. Waiting for everyone to be ready",
        time: Date.now(),
      });
      io.to(gameId).emit("updateLogs", game.logs);
    }
  });

  socket.on("transfer", ({ gameId, toName, amount, isBank }) => {
    const game = games[gameId];
    if (!game) return;

    const sender = game.players.find((p) => p.socketId === socket.id);
    const amountNum = parseInt(amount);

    if (!sender && !isBank) return;
    if (amountNum <= 0) return socket.emit("error", "Invalid amount");

    if (isBank && socket.id !== game.hostSocketId) {
      return socket.emit("error", "Only host can perform bank actions");
    }

    // Check if bank has sufficient balance for bank transfers
    if (isBank && game.bankBalance < amountNum && toName !== "BANK") {
      return socket.emit("error", "Bank has insufficient funds");
    }

    if (toName === "EVERYONE") {
      const recipients = [];

      // Count how many players will receive (excluding sender if not bank)
      const targetPlayers = game.players.filter(
        (p) => isBank || p.socketId !== socket.id
      );
      const totalAmount = amountNum * targetPlayers.length;

      // Check balance BEFORE loop for non-bank players
      if (!isBank && sender.balance < totalAmount) {
        game.logs.unshift({
          msg: `❌ ${sender.name} tried to pay EVERYONE ₹${amountNum} but has insufficient balance`,
          time: Date.now(),
        });
        io.to(gameId).emit("updateLogs", game.logs);
        return socket.emit("error", "Insufficient funds");
      }

      // Check bank balance for bank transfers
      if (isBank && game.bankBalance < totalAmount) {
        return socket.emit(
          "error",
          `Bank has insufficient funds`
        );
      }

      game.players.forEach((target) => {
        if (!isBank && target.socketId === socket.id) return; // Skip sender

        if (!isBank) sender.balance -= amountNum;
        else game.bankBalance -= amountNum;

        target.balance += amountNum;
        recipients.push(target.name);
      });

      if (isBank || sender.balance >= 0) {
        game.logs.unshift({
          msg: `${
            isBank ? "🏦 BANK" : sender.name
          } paid EVERYONE ₹${amountNum}`,
          time: Date.now(),
        });

        // Save transaction for undo
        game.lastTransaction = {
          type: "EVERYONE",
          from: isBank ? "BANK" : sender.name,
          recipients: recipients,
          amount: amountNum,
          timestamp: Date.now(),
        };
      }

      // Update bank stats if bank paid
      if (isBank) {
        recipients.forEach(recipientName => {
          if (!game.bankStats.paidTo[recipientName]) {
            game.bankStats.paidTo[recipientName] = 0;
          }
          game.bankStats.paidTo[recipientName] += amountNum;
        });
        game.bankStats.totalPaid += (amountNum * recipients.length);
        io.to(gameId).emit("bankStatsUpdate", game.bankStats);
      }

    } else if (toName.toLowerCase().includes("bank")) {
      // Payment to bank
      console.log("💰 Payment to bank from:", sender ? sender.name : "unknown");

      if (!sender) {
        console.log("❌ Sender not found for bank payment");
        return socket.emit("error", "Invalid sender");
      }

      if (sender.balance < amountNum) {
        game.logs.unshift({
          msg: `❌ ${sender.name} tried to pay Bank ₹${amountNum} but has insufficient balance`,
          time: Date.now(),
        });
        io.to(gameId).emit("updateLogs", game.logs);
        return socket.emit("error", "Insufficient funds");
      }

      sender.balance -= amountNum;
      game.bankBalance += amountNum;

      game.logs.unshift({
        msg: `${sender.name} paid ₹${amountNum} to the Bank`,
        time: Date.now(),
      });

      // Update bank stats
      if (!game.bankStats.receivedFrom[sender.name]) {
        game.bankStats.receivedFrom[sender.name] = 0;
      }
      game.bankStats.receivedFrom[sender.name] += amountNum;
      game.bankStats.totalReceived += amountNum;
      io.to(gameId).emit("bankStatsUpdate", game.bankStats);

      // Save transaction for undo
      game.lastTransaction = {
        type: "TO_BANK",
        from: sender.name,
        amount: amountNum,
        timestamp: Date.now(),
      };

      console.log("✅ Bank payment successful");
    } else {
      const target = game.players.find((p) => p.name === toName);
      if (!target) return socket.emit("error", "Player not found");

      if (!isBank) {
        if (sender.balance < amountNum) {
          game.logs.unshift({
            msg: `❌ ${sender.name} tried to pay ${target.name} ₹${amountNum} but has insufficient balance`,
            time: Date.now(),
          });
          io.to(gameId).emit("updateLogs", game.logs);
          return socket.emit("error", "Insufficient funds");
        }
        sender.balance -= amountNum;
      } else {
        game.bankBalance -= amountNum;
      }

      target.balance += amountNum;

      game.logs.unshift({
        msg: `${isBank ? "🏦 BANK" : sender.name} paid ${
          target.name
        } ₹${amountNum}`,
        time: Date.now(),
      });

      // Save transaction for undo
      game.lastTransaction = {
        type: "INDIVIDUAL",
        from: isBank ? "BANK" : sender.name,
        to: target.name,
        amount: amountNum,
        timestamp: Date.now(),
      };

      // Update bank stats if bank paid
      if (isBank) {
        if (!game.bankStats.paidTo[target.name]) {
          game.bankStats.paidTo[target.name] = 0;
        }
        game.bankStats.paidTo[target.name] += amountNum;
        game.bankStats.totalPaid += amountNum;
        io.to(gameId).emit("bankStatsUpdate", game.bankStats);
      } 
    }

    game.players.forEach((p) => {
      io.to(p.socketId).emit("balanceUpdate", { 
        balance: p.balance, 
        context: 'update',
        lastTransaction: game.lastTransaction 
      });
    });
    io.to(gameId).emit("updateLogs", game.logs);

    // Update bank balance for host
    io.to(game.hostSocketId).emit("bankBalanceUpdate", game.bankBalance);

    // Enable undo button
    io.to(game.hostSocketId).emit("enableUndo");
  });

  socket.on("requestMoney", ({ gameId, amount, targetName }) => {
    const game = games[gameId];
    if (!game) return;

    const requester = game.players.find((p) => p.socketId === socket.id);
    if (!requester) return;

    const now = Date.now();
    requester.requestsMade = requester.requestsMade.filter(
      (t) => now - t < 90000
    );

    if (requester.requestsMade.length >= 3) {
      return socket.emit("error", "⏳ Cooldown: Wait 90 seconds");
    }

    requester.requestsMade.push(now);

    const reqId = now.toString();
    const amountNum = parseInt(amount);

    if (targetName === "EVERYONE") {
      // Request from everyone
      game.requests[reqId] = {
        requesterName: requester.name,
        requesterSocketId: socket.id,
        amount: amountNum,
        targetType: "EVERYONE",
        accepted: 0,
        rejected: 0,
        totalTargets: game.players.length - 1,
        responses: {},
      };

      game.logs.unshift({
        msg: `💰 ${requester.name} requested ₹${amount} from EVERYONE`,
        time: Date.now(),
      });
      io.to(gameId).emit("updateLogs", game.logs);

      game.players.forEach((p) => {
        if (p.socketId !== socket.id) {
          io.to(p.socketId).emit("incomingRequest", {
            reqId,
            requesterName: requester.name,
            amount: amountNum,
          });
        }
      });

      setTimeout(() => {
        if (game.requests[reqId]) {
          const req = game.requests[reqId];
          const ignored = req.totalTargets - (req.accepted + req.rejected);
          game.logs.unshift({
            msg: `Request: ${req.accepted} Paid, ${req.rejected} Rejected, ${ignored} Ignored`,
            time: Date.now(),
          });
          io.to(gameId).emit("updateLogs", game.logs);
          delete game.requests[reqId];
        }
      }, 30000);

    } else if (targetName === "BANK") {
      // Request from bank
      game.requests[reqId] = {
        requesterName: requester.name,
        requesterSocketId: socket.id,
        amount: amountNum,
        targetType: "BANK",
        targetName: "BANK",
      };

      game.logs.unshift({
        msg: `💰 ${requester.name} requested ₹${amount} from Bank`,
        time: Date.now(),
      });
      io.to(gameId).emit("updateLogs", game.logs);

      // Send to host
      io.to(game.hostSocketId).emit("incomingRequest", {
        reqId,
        requesterName: requester.name,
        amount: amountNum,
      });

      setTimeout(() => {
        if (game.requests[reqId]) {
          game.logs.unshift({
            msg: `Request from ${requester.name} to Bank expired (no response)`,
            time: Date.now(),
          });
          io.to(gameId).emit("updateLogs", game.logs);
          delete game.requests[reqId];
        }
      }, 30000);

    } else {
      // Request from individual player
      const targetPlayer = game.players.find((p) => p.name === targetName);
      if (!targetPlayer) return socket.emit("error", "Player not found");

      game.requests[reqId] = {
        requesterName: requester.name,
        requesterSocketId: socket.id,
        amount: amountNum,
        targetType: "INDIVIDUAL",
        targetName: targetName,
        targetSocketId: targetPlayer.socketId,
      };

      game.logs.unshift({
        msg: `💰 ${requester.name} requested ₹${amount} from ${targetName}`,
        time: Date.now(),
      });
      io.to(gameId).emit("updateLogs", game.logs);

      // Send only to target player
      io.to(targetPlayer.socketId).emit("incomingRequest", {
        reqId,
        requesterName: requester.name,
        amount: amountNum,
      });

      setTimeout(() => {
        if (game.requests[reqId]) {
          game.logs.unshift({
            msg: `Request from ${requester.name} to ${targetName} expired (no response)`,
            time: Date.now(),
          });
          io.to(gameId).emit("updateLogs", game.logs);
          delete game.requests[reqId];
        }
      }, 30000);
    }
  });

  socket.on("respondRequest", ({ gameId, reqId, decision }) => {
    const game = games[gameId];
    if (!game || !game.requests[reqId]) return;

    const req = game.requests[reqId];
    const requester = game.players.find((p) => p.name === req.requesterName);

    // Handle BANK response
    if (req.targetType === "BANK" && socket.id === game.hostSocketId) {
      if (decision === "accept") {
        if (game.bankBalance >= req.amount) {
          game.bankBalance -= req.amount;
          if (requester) requester.balance += req.amount;

          game.logs.unshift({
            msg: `✅ Bank paid ₹${req.amount} to ${req.requesterName}`,
            time: Date.now(),
          });

          game.lastTransaction = {
            type: "INDIVIDUAL",
            from: "BANK",
            to: req.requesterName,
            amount: req.amount,
            timestamp: Date.now(),
          };

          io.to(game.hostSocketId).emit("enableUndo");
          io.to(game.hostSocketId).emit("bankBalanceUpdate", game.bankBalance);
          // Update bank stats
          if (!game.bankStats.paidTo[req.requesterName]) {
            game.bankStats.paidTo[req.requesterName] = 0;
          }
          game.bankStats.paidTo[req.requesterName] += req.amount;
          game.bankStats.totalPaid += req.amount;
          io.to(gameId).emit("bankStatsUpdate", game.bankStats);
        } else {
          socket.emit("error", "Bank has insufficient funds");
          return;
        }
      } else {
        game.logs.unshift({
          msg: `❌ Bank rejected ${req.requesterName}'s request`,
          time: Date.now(),
        });
      }

      delete game.requests[reqId];
      game.players.forEach((p) => {
        io.to(p.socketId).emit("balanceUpdate", { 
          balance: p.balance, 
          context: 'update',
          lastTransaction: game.lastTransaction 
        });
      });
      io.to(gameId).emit("updateLogs", game.logs);
      return;
    }

    // Handle INDIVIDUAL or EVERYONE response
    const payer = game.players.find((p) => p.socketId === socket.id);
    if (!payer) return;

    if (req.targetType === "EVERYONE") {
      if (req.responses[socket.id]) return;
      req.responses[socket.id] = decision;
    }

    if (decision === "accept") {
      if (payer.balance >= req.amount) {
        payer.balance -= req.amount;
        if (requester) requester.balance += req.amount;

        if (req.targetType === "EVERYONE") {
          req.accepted++;
        }

        game.logs.unshift({
          msg: `✅ ${payer.name} paid ₹${req.amount} to ${req.requesterName}`,
          time: Date.now(),
        });

        game.lastTransaction = {
          type: "INDIVIDUAL",
          from: payer.name,
          to: req.requesterName,
          amount: req.amount,
          timestamp: Date.now(),
        };

        io.to(game.hostSocketId).emit("enableUndo");

        // Delete individual request immediately
        if (req.targetType === "INDIVIDUAL") {
          delete game.requests[reqId];
        }
      } else {
        socket.emit("error", "Insufficient funds");
        if (req.targetType === "EVERYONE") {
          req.rejected++;
        } else {
          delete game.requests[reqId];
          game.logs.unshift({
            msg: `❌ ${payer.name} couldn't pay ${req.requesterName} (insufficient funds)`,
            time: Date.now(),
          });
        }
        io.to(gameId).emit("updateLogs", game.logs);
        return;
      }
    } else {
      if (req.targetType === "EVERYONE") {
        req.rejected++;
      }

      game.logs.unshift({
        msg: `❌ ${payer.name} rejected ${req.requesterName}'s request`,
        time: Date.now(),
      });

      // Delete individual request immediately
      if (req.targetType === "INDIVIDUAL") {
        delete game.requests[reqId];
      }
    }

    game.players.forEach((p) => {
      io.to(p.socketId).emit("balanceUpdate", { 
        balance: p.balance, 
        context: 'update',
        lastTransaction: game.lastTransaction 
      });
    });
    io.to(gameId).emit("updateLogs", game.logs);
  });

  // --- UNDO TRANSACTION ---
  socket.on("undoTransaction", ({ gameId }) => {
  const game = games[gameId];
  if (!game) return;

  if (socket.id !== game.hostSocketId) {
    return socket.emit("error", "Only host can undo transactions");
  }

  if (!game.lastTransaction) {
    return socket.emit("error", "No transaction to undo");
  }

  const trans = game.lastTransaction;
  const now = Date.now();
  
  // Create undo transaction object for tracking
  let undoTransaction = null;

  // Undo based on transaction type
  if (trans.type === "EVERYONE") {
    trans.recipients.forEach((recipientName) => {
      const recipient = game.players.find((p) => p.name === recipientName);
      if (recipient) {
        recipient.balance -= trans.amount;
        if (trans.from === "BANK") {
          game.bankBalance += trans.amount;
          
          // Update bank stats - reverse the payment
          if (game.bankStats.paidTo[recipientName]) {
            game.bankStats.paidTo[recipientName] -= trans.amount;
            if (game.bankStats.paidTo[recipientName] <= 0) {
              delete game.bankStats.paidTo[recipientName];
            }
          }
          game.bankStats.totalPaid -= trans.amount;
        }
      }
    });

    if (trans.from !== "BANK") {
      const sender = game.players.find((p) => p.name === trans.from);
      if (sender) {
        sender.balance += trans.amount * trans.recipients.length;
      }
    }

    game.logs.unshift({
      msg: `🔄 UNDONE: ${trans.from} payment to EVERYONE of ₹${trans.amount}`,
      time: Date.now(),
    });
    
    // Create undo transaction for each recipient
    undoTransaction = {
      type: "UNDO_EVERYONE",
      from: trans.from,
      recipients: trans.recipients,
      amount: trans.amount,
      timestamp: Date.now(),
    };
    
  } else if (trans.type === "TO_BANK") {
    const sender = game.players.find((p) => p.name === trans.from);
    if (sender) {
      sender.balance += trans.amount;
      game.bankBalance -= trans.amount;
      
      // Update bank stats - reverse the receipt
      if (game.bankStats.receivedFrom[sender.name]) {
        game.bankStats.receivedFrom[sender.name] -= trans.amount;
        if (game.bankStats.receivedFrom[sender.name] <= 0) {
          delete game.bankStats.receivedFrom[sender.name];
        }
      }
      game.bankStats.totalReceived -= trans.amount;
    }

    game.logs.unshift({
      msg: `🔄 UNDONE: ${trans.from} payment to Bank of ₹${trans.amount}`,
      time: Date.now(),
    });
    
    undoTransaction = {
      type: "UNDO_TO_BANK",
      from: "BANK",
      to: trans.from,
      amount: trans.amount,
      timestamp: Date.now(),
    };
    
  } else if (trans.type === "INDIVIDUAL") {
    const recipient = game.players.find((p) => p.name === trans.to);
    if (recipient) {
      recipient.balance -= trans.amount;
    }

    if (trans.from === "BANK") {
      game.bankBalance += trans.amount;
      
      // Update bank stats - reverse the payment
      if (game.bankStats.paidTo[trans.to]) {
        game.bankStats.paidTo[trans.to] -= trans.amount;
        if (game.bankStats.paidTo[trans.to] <= 0) {
          delete game.bankStats.paidTo[trans.to];
        }
      }
      game.bankStats.totalPaid -= trans.amount;
      
      undoTransaction = {
        type: "UNDO_FROM_BANK",
        from: trans.to,
        to: "BANK",
        amount: trans.amount,
        timestamp: Date.now(),
      };
      
    } else {
      const sender = game.players.find((p) => p.name === trans.from);
      if (sender) {
        sender.balance += trans.amount;
      }
      
      undoTransaction = {
        type: "UNDO_INDIVIDUAL",
        from: trans.to,
        to: trans.from,
        amount: trans.amount,
        timestamp: Date.now(),
      };
    }

    game.logs.unshift({
      msg: `🔄 UNDONE: ${trans.from} payment to ${trans.to} of ₹${trans.amount}`,
      time: Date.now(),
    });
  }

  // Clear last transaction
  game.lastTransaction = null;

  // Update all players WITH undo transaction details
  game.players.forEach((p) => {
    io.to(p.socketId).emit("balanceUpdate", { 
      balance: p.balance, 
      context: 'undo',
      lastTransaction: undoTransaction 
    });
  });
  
  // Update bank balance and stats
  io.to(game.hostSocketId).emit("bankBalanceUpdate", game.bankBalance);
  io.to(gameId).emit("bankStatsUpdate", game.bankStats);
  io.to(gameId).emit("updateLogs", game.logs);
  io.to(game.hostSocketId).emit("undoComplete");

  console.log("✅ Transaction undone successfully");
});

  socket.on("endGame", ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    if (game.hostSocketId !== socket.id) {
      return socket.emit("error", "Only host can end the game");
    }

    game.status = "ended";
    game.logs.unshift({ msg: "🏁 Game Ended by Host", time: Date.now() });
    io.to(gameId).emit("gameOver", game.players);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);

    Object.values(games).forEach((game) => {
      const player = game.players.find((p) => p.socketId === socket.id);
      if (player) {
        player.active = false;
        game.logs.unshift({
          msg: `${player.name} disconnected`,
          time: Date.now(),
        });
        io.to(game.id).emit("updatePlayerList", game.players);
        io.to(game.id).emit("updateLogs", game.logs);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("=================================");
  console.log("🚀 SERVER STARTED");
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log("=================================");
});
