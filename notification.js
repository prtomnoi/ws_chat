const WebSocket = require('ws');
const axios = require('axios');

const NOTIFICATION_PORT = 8081;
const EXTERNAL_API_URL = 'https://cleanmate.app/api/socket/notify';

const wss = new WebSocket.Server({ port: NOTIFICATION_PORT });
console.log(`Notification WebSocket server running on ws://localhost:${NOTIFICATION_PORT}`);

const clients = {};

// Function to handle incoming messages
function handleMessage(ws, data) {
    try {
        const message = JSON.parse(data);
        const { sessions, usersId, triggerTargetId, text } = message;

        // Register client with userId
        if (sessions && usersId) {
            clients[usersId] = ws;
            console.log(`Registered client with sessions: ${sessions} and usersId: ${usersId}`);
        }

        // Handle admin-triggered data fetch
        if (sessions === 'admin' && triggerTargetId) {
            console.log(`Admin triggered data fetch for userId: ${triggerTargetId}`);
            fetchAndBroadcastData(triggerTargetId);
        }

        // Handle direct messages between users
        if (sessions === 'user' && usersId && text) {
            console.log(`User ${usersId} sent message: ${text}`);
            broadcastMessageToAdmin(usersId, text);
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({ success: false, error: "Failed to process request" }));
    }
}

// Function to broadcast messages to the admin
function broadcastMessageToAdmin(userId, text) {
    for (const id in clients) {
        if (id.startsWith('admin')) {
            const client = clients[id];
            if (client && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ success: true, from: userId, message: text }));
                console.log(`Message from user ${userId} sent to admin`);
            }
        }
    }
}

// Function to fetch data from external API and broadcast to user
async function fetchAndBroadcastData(userId) {
    console.log('Fetching data from API for broadcast...');
    const data = await callExternalApi(userId);
    if (data) {
        console.log(`Data fetched successfully, broadcasting to userId: ${userId}`);
        broadcastDataToUser(data, userId);
    } else {
        console.error('No data to broadcast.');
    }
}

// Function to call external API
async function callExternalApi(userId) {
    try {
        const response = await axios.post(EXTERNAL_API_URL, {
            sessions: 'user',
            usersId: userId
        });

        if (response.status === 200 && response.data) {
            console.log('API response:', response.data);
            return response.data;
        } else {
            console.error('Failed to retrieve data from external API');
            return null;
        }
    } catch (error) {
        console.error('Error calling external API:', error);
        return null;
    }
}

// Function to broadcast data to a specific user
function broadcastDataToUser(data, userId) {
    const client = clients[userId];
    if (client && client.readyState === WebSocket.OPEN) {
        console.log(`Sending data to userId: ${userId}`);
        client.send(JSON.stringify({ success: true, data }));
    } else {
        console.log(`UserId ${userId} is not connected.`);
    }
}

// Set up connection handling
wss.on('connection', (ws) => {
    console.log('New client connected to notification WebSocket');
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (data) => {
        handleMessage(ws, data);
    });

    ws.on('close', () => {
        console.log('Client disconnected from notification WebSocket');
        for (const userId in clients) {
            if (clients[userId] === ws) {
                delete clients[userId];
                console.log(`Removed client with userId: ${userId}`);
                break;
            }
        }
    });
});

// Periodically check for inactive connections
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            console.log('Terminating inactive client');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000); // Check every 30 seconds

wss.on('close', () => {
    clearInterval(interval);
});
