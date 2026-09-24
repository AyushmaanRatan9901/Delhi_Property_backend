require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { initSocket } = require("./src/config/socket");
const { startRentScheduler } = require("./src/services/rentScheduler");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const start = async () => {
  await connectDB();
  const server = http.createServer(app);

  // Initialize Socket.io on HTTP Server
  initSocket(server);

  // Start Automated Rent Workflow Scheduler (Hourly Cron)
  startRentScheduler();

  server.listen(PORT, HOST, () => {
    console.log(
      `\n🚀 Rent Management Server (with Socket.io) is running in ${process.env.NODE_ENV || "development"} mode!`,
    );
    console.log(`📡 Local:   http://localhost:${PORT}`);
    console.log(`🌐 Network: http://192.168.1.12:${PORT}`);
    console.log(`🔗 API V1:  http://192.168.1.12:${PORT}/api/v1\n`);
  });
};

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
