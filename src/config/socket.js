const { Server } = require('socket.io');

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`⚡ [Socket.io] Client connected: ${socket.id}`);

    // Client registers their userId and role
    socket.on('register', (data) => {
      try {
        const { userId, role } = data || {};
        if (userId) {
          socket.join(`user_${userId}`);
          console.log(`👤 [Socket.io] Socket ${socket.id} joined user_${userId}`);
        }
        if (role) {
          socket.join(`role_${role}`);
          console.log(`🏷️ [Socket.io] Socket ${socket.id} joined role_${role}`);
        }
      } catch (err) {
        console.error('Error handling socket register:', err);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Socket.io] Client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

const emitToUser = (userId, event, data) => {
  if (!io) return;
  const targetRoom = `user_${userId}`;
  io.to(targetRoom).emit(event, data);
  console.log(`📢 [Socket.io] Emitted "${event}" to ${targetRoom}`);
};

const emitToRole = (role, event, data) => {
  if (!io) return;
  const targetRoom = `role_${role}`;
  io.to(targetRoom).emit(event, data);
  console.log(`📢 [Socket.io] Emitted "${event}" to ${targetRoom}`);
};

const broadcast = (event, data) => {
  if (!io) return;
  io.emit(event, data);
  console.log(`📢 [Socket.io] Broadcasted "${event}" to all clients`);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToRole,
  broadcast,
};
