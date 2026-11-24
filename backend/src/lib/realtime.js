let io = null;
export const setIo = (x) => { io = x; };
export const emitAll = (event, payload) => io?.emit(event, payload);
export const emitRoom = (room, event, payload) => io?.to(room).emit(event, payload);
export const emitUser = (code, event, payload) => io?.to(`user:${code}`).emit(event, payload);
export const emitRole = (role, event, payload) => io?.to(`role:${role}`).emit(event, payload);
export const emitStaff = (event, payload) => io?.to('staff').emit(event, payload);
