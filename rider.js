const WebSocket = require('ws');

const NOTIFICATION_PORT = 8084;

const wss = new WebSocket.Server({ port: NOTIFICATION_PORT });
console.log(`WebSocket server running on ws://localhost:${NOTIFICATION_PORT}`);

const clients = new Map(); 
wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            const { latitude, longitude, usersId, targetUserId, text } = message;

            if (usersId) {
                clients.set(usersId, ws);
                console.log(`User ${usersId} connected with coordinates: ${latitude}, ${longitude}`);
            }

            if (targetUserId && text) {
                const targetClient = clients.get(targetUserId);
                
                if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                    targetClient.send(JSON.stringify({
                        from: usersId,
                        text,
                        latitude,
                        longitude
                    }));
                    console.log(`Message sent from User ${usersId} to User ${targetUserId}: ${text}`);
                } else {
                    console.log(`User ${targetUserId} is not connected.`);
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            ws.send(JSON.stringify({ success: false, error: "Failed to process request" }));
        }
    });

    ws.on('close', () => {
        for (const [userId, clientWs] of clients.entries()) {
            if (clientWs === ws) {
                clients.delete(userId);
                console.log(`User ${userId} disconnected`);
                break;
            }
        }
    });
});
