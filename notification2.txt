const WebSocket = require('ws');
const axios = require('axios');

const NOTIFICATION_PORT = 8082;
const EXTERNAL_API_URL = 'https://cleanmate.dekesandev.com/api/socket/notify';

// Set up WebSocket server
const wss = new WebSocket.Server({ port: NOTIFICATION_PORT });
console.log(`Notification WebSocket server running on ws://localhost:${NOTIFICATION_PORT}`);

// In-memory variables for sessions and usersId (you may replace with dynamic values as needed)
let defaultSessions = 'admin,user';
let defaultUsersId = '123';

// Handle incoming WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected to notification WebSocket');

    // Listen for registration messages to update sessions and usersId if needed
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            const { sessions, usersId } = message;

            if (sessions && usersId) {
                // Update default sessions and usersId if received from the client
                defaultSessions = sessions;
                defaultUsersId = usersId;
                console.log(`Updated sessions: ${sessions} and usersId: ${usersId}`);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            ws.send(JSON.stringify({ success: false, error: "Failed to process request" }));
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        console.log('Client disconnected from notification WebSocket');
    });
});

// Function to call the external API with sessions and usersId
async function callExternalApi(sessions, usersId) {
    try {
        const response = await axios.post(EXTERNAL_API_URL, {
            sessions: sessions,
            usersId: usersId
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

// Function to broadcast data to all connected clients
function broadcastData(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ success: true, data }));
        }
    });
}

// Function to periodically fetch and broadcast data every 3 seconds
async function fetchAndBroadcastData() {
    const data = await callExternalApi(defaultSessions, defaultUsersId);
    if (data) {
        console.log('Broadcasting data to clients:', data);
        broadcastData(data);
    }
}

// Start periodic broadcast every 3 seconds
setInterval(fetchAndBroadcastData, 5000); // 3000 ms = 3 seconds
