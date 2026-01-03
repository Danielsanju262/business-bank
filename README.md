# 🏦 Board Game Bank

A **real-time multiplayer banking system** designed to replace physical money in board games like Monopoly. One player hosts the game as the "Bank" while other players join and manage their virtual wallets.

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D14.0.0-green?logo=node.js)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.6.1-black?logo=socket.io)
![Express](https://img.shields.io/badge/Express-4.18.2-blue?logo=express)

---

## ✨ Features

- **Real-time Multiplayer** – All transactions update instantly across all connected devices
- **Host as Bank** – One player manages the game as the banker with special controls
- **Player Wallets** – Each player has their own balance that can be sent/received
- **Money Transfers** – Pay other players or the bank directly
- **Money Requests** – Request money from players, everyone, or the bank
- **Undo Transactions** – Bank can undo the last transaction if mistakes are made
- **Reconnection Support** – Players can rejoin games if disconnected
- **Game Lobby** – Ready-up system with countdown before game starts
- **Activity Logs** – Complete transaction history for transparency
- **Bank Statistics** – Track total received/paid by the bank
- **In-Game FAQ** – Built-in game rules reference for Monopoly-style games
- **Mobile-Friendly** – Responsive design optimized for phones and tablets

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v14.0.0 or higher
- npm (comes with Node.js) or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/business-bank.git
   cd business-bank
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the server**
   ```bash
   npm start
   # or
   yarn start
   ```

4. **Open the game**
   - Open your browser and navigate to: `http://localhost:3000`
   - For local network play, use your machine's IP address (e.g., `http://192.168.1.100:3000`)

---

## 🎮 How to Play

### Hosting a Game (as Bank)

1. Enter your name
2. Click **"Host New Game (as Bank)"**
3. Set the starting money for each player (default: ₹1,500)
4. Set the bank's starting balance (default: ₹10,000)
5. Click **"Create Game"**
6. Share the **Game ID** with other players

### Joining a Game (as Player)

1. Enter your name
2. Enter the **Game ID** shared by the host
3. Click **"Join"**
4. Wait in the lobby and click **"I'm Ready"** when ready
5. The game starts automatically when all players are ready (5-second countdown)

### During the Game

#### For Players:
- **Pay Player** – Send money to another player or the bank
- **Request** – Request money from a player, everyone, or the bank
- **View Balance** – Toggle visibility with the eye icon (for privacy)

#### For the Bank:
- **Send Money** – Distribute money to any player or everyone
- **Undo Last Transaction** – Reverse the most recent transaction
- **End Game** – Finish the game and view final standings
- **View Bank Statistics** – See total money received/paid

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **Node.js** | Server runtime |
| **Express** | Web server framework |
| **Socket.IO** | Real-time bidirectional communication |
| **HTML/CSS/JS** | Frontend interface |

---

## 📁 Project Structure

```
business-bank/
├── public/
│   └── index.html      # Frontend application (HTML, CSS, JS)
├── server.js           # Backend server with Socket.IO
├── package.json        # Project configuration and dependencies
└── README.md           # This file
```

---

## ⚙️ Configuration

### Environment Variables

You can configure the server port by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

Default port is `3000`.

### Game Settings

When hosting a game, you can customize:
- **Starting Money** – Initial balance for each player (default: ₹1,500)
- **Bank Balance** – Initial bank funds (default: ₹10,000)

---

## 🌐 Deploying for LAN Play

To play with friends on the same network:

1. Find your computer's local IP address:
   - **Windows**: Run `ipconfig` and look for IPv4 Address
   - **Mac/Linux**: Run `ifconfig` or `ip addr`

2. Start the server as usual

3. Other players connect using: `http://YOUR_IP:3000`

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙋 Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Check the in-game FAQ section for game rules

---

**Made with ❤️ for board game enthusiasts who prefer digital banking!**
