const WebSocket = require('ws');
const axios = require('axios');

const NOTIFICATION_PORT = 8081;
const EXTERNAL_API_URL = 'https://cleanmate.app/api/socket/notify';

// Set up WebSocket server
const wss = new WebSocket.Server({ port: NOTIFICATION_PORT });
console.log(`Notification WebSocket server running on ws://localhost:${NOTIFICATION_PORT}`);


const clients = {};
const defaultSessions = 0;

wss.on('connection', (ws) => {
    console.log('New client connected to notification WebSocket');

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            const { sessions, usersId, triggerTargetId } = message;


            if (sessions && usersId) {
                clients[usersId] = ws;  
                console.log(`Registered client with sessions: ${sessions} and usersId: ${usersId}`);
            }

       
            if (sessions === 'admin' && triggerTargetId) {
                console.log(`Admin triggered data fetch for userId: ${triggerTargetId}`);
     
                await fetchAndBroadcastData(triggerTargetId);
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            ws.send(JSON.stringify({ success: false, error: "Failed to process request" }));
        }
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


function broadcastDataToUser(data, userId) {
    const client = clients[userId];
    if (client && client.readyState === WebSocket.OPEN) {
        console.log(`Sending data to userId: ${userId}`);
        client.send(JSON.stringify({ success: true, data }));
    } else {
        console.log(`UserId ${userId} is not connected.`);
    }
}


async function fetchAndBroadcastData(userId) {
    console.log('Fetching data from API for broadcast...');
    const data = await callExternalApi(defaultSessions, userId);  
    if (data) {
        console.log(`Data fetched successfully, broadcasting to userId: ${userId}`);
        broadcastDataToUser(data, userId);
    } else {
        console.error('No data to broadcast.');
    }
}
