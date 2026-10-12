import { Server } from 'socket.io';

let io = null;

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        },
    });

    io.on('connection', (socket) => {
        socket.on('join', (userId) => {
            if (userId) {
                const room = userId.toString();
                socket.join(room);
                console.log(`User ${userId} joined socket room: ${room}`);
            }
        });

        socket.on('leave', (userId) => {
            if (userId) {
                socket.leave(userId.toString());
            }
        });

        socket.on('disconnect', () => {
            // Socket disconnected
        });
    });

    return io;
};

export const getIo = () => {
    return io;
};

export const emitToUser = (userId, event, data) => {
    if (io && userId) {
        io.to(userId.toString()).emit(event, data);
    }
};

