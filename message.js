const WebSocket = require('ws');

const PORT = 8085;
const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket server running on ws://localhost:${PORT}`);

// Object to store connected clients with their userIds
const clients = {};

// Handle new client connections
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Listen for messages from clients
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            const { userId, targetUserId, text } = message;

            // Register client with userId
            if (userId) {
                clients[userId] = ws;
                console.log(`User ${userId} registered`);
            }

            // Handle direct messages
            if (userId && targetUserId && text) {
                sendMessageToUser(userId, targetUserId, text);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ success: false, error: 'Invalid message format' }));
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        for (const id in clients) {
            if (clients[id] === ws) {
                delete clients[id];
                console.log(`User ${id} disconnected`);
                break;
            }
        }
    });
});

// Function to send a message to a specific user
function sendMessageToUser(senderId, receiverId, text) {
    const receiverWs = clients[receiverId];
    if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
        const message = {
            success: true,
            from: senderId,
            message: text,
        };
        receiverWs.send(JSON.stringify(message));
        console.log(`Message from ${senderId} to ${receiverId}: ${text}`);
    } else {
        console.log(`User ${receiverId} is not connected`);
    }
}
