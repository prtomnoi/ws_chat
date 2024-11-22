const WebSocket = require('ws');
const axios = require('axios');

const CHAT_HISTORY_API_URL = 'https://cleanmate.dekesandev.com/api/chat/ChannelById/';
const SEND_MESSAGE_API_URL = 'https://cleanmate.dekesandev.com/api/chat/sendMessage';

// Store users by channel ID
const channelUsers = {};

// Function to load chat history for a specific channel from the API
async function loadChatHistoryByChannelId(channel_id) {
    try {
        const response = await axios.get(`${CHAT_HISTORY_API_URL}${channel_id}`);
        if (response.data.message) {
            console.log(`Loaded chat history for channel ${channel_id} from API.`);
            return response.data.message.map(entry => {
                let parsedMessage;
                try {
                    parsedMessage = JSON.parse(entry.message);
                } catch (error) {
                    parsedMessage = { message: entry.message };
                }

                return {
                    sender: entry.user_id,
                    created: entry.created_at,
                    seed: entry.seed,
                    message: parsedMessage.message || parsedMessage,
                };
            });
        } else {
            console.error(`Failed to load chat history for channel ${channel_id}.`);
            return [];
        }
    } catch (error) {
        console.error(`Error fetching chat history for channel ${channel_id}:`, error);
        return [];
    }
}

// Function to save a message to the API
async function saveMessageToAPI(user_id, chat_channel_id, message, seed) {
    try {
        const data = {
            user_id: user_id,
            chat_channel_id: chat_channel_id,
            message: message,
            seed: seed
        };
        const response = await axios.post(SEND_MESSAGE_API_URL, data);
        console.log(`Message saved to API:`, response.data);
    } catch (error) {
        console.error("Error saving message to API:", error);
    }
}

// Store WebSocket connections by user for targeted messaging
const userConnections = {};

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: 8081 });
console.log('WebSocket server running on ws://localhost:8081');

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);
            console.log(parsedData);

            const { channel_id, sender, message, type, seed } = parsedData;

            if (!channel_id || !sender || !type) {
                console.error("Missing required properties in the received data.");
                ws.send(JSON.stringify({ error: "Missing required properties." }));
                return;
            }

            if (type === 'join') {
                // Register the user's connection
                userConnections[sender] = ws;

                // Add user to the channel
                if (!channelUsers[channel_id]) {
                    channelUsers[channel_id] = new Set();
                }
                channelUsers[channel_id].add(sender);

                // Fetch and send chat history to the user
                const history = await loadChatHistoryByChannelId(channel_id);
                ws.send(JSON.stringify({ history }));

                return;
            }else {

            // if (type === 'message') {
                // Broadcast the new message to all users in the same channel
                const newMessage = { channel_id, sender, message, seed };
                if (channelUsers[channel_id]) {
                    channelUsers[channel_id].forEach(user => {
                        if (userConnections[user] && userConnections[user].readyState === WebSocket.OPEN) {
                            userConnections[user].send(JSON.stringify(newMessage));
                        }
                    });
                }

                // Save the message to the API
                await saveMessageToAPI(sender, channel_id, message, seed || 1);
            }
        } catch (error) {
            console.error("Error processing message:", error);
            ws.send(JSON.stringify({ error: "Failed to process message" }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');

        // Remove user from userConnections and channelUsers
        for (let user in userConnections) {
            if (userConnections[user] === ws) {
                delete userConnections[user];
                for (let channel in channelUsers) {
                    channelUsers[channel].delete(user);
                    if (channelUsers[channel].size === 0) {
                        delete channelUsers[channel];
                    }
                }
                break;
            }
        }
    });
});
