const WebSocket = require('ws');
const axios = require('axios');

const CHANNELS_API_URL = 'https://cleanmate.dekesandev.com/api/chat/mathChat';
const CHAT_HISTORY_API_URL = 'https://cleanmate.dekesandev.com/api/chat/ChannelById/';
const SEND_MESSAGE_API_URL = 'https://cleanmate.dekesandev.com/api/chat/sendMessage';

let channelsData = {}; 

async function loadChannelsFromAPI() {
    try {
        const response = await axios.get(CHANNELS_API_URL);
        if (response.data.status === 200 && response.data.channels) {
        
            channelsData = Object.fromEntries(
                Object.entries(response.data.channels).map(([channel, users]) => [
                    channel,
                    users.map(String),
                ])
            );
        
        } else {
            console.error('Failed to load channels data from API.');
        }
    } catch (error) {
        console.error('Error fetching channels data from API:', error);
    }
}


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
                    seed : entry.seed,
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


const userConnections = {};

const wss = new WebSocket.Server({ port: 8080 });
console.log('WebSocket server running on ws://localhost:8080');


loadChannelsFromAPI().then(() => {
    console.log('Channels loaded from API, server is ready to accept connections.');
});


wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);
            const { channel_id, sender, message, type, seed } = parsedData;

   
            if (type === 'join') {
                if (!channelsData[channel_id]) {
                    ws.send(JSON.stringify({ error: `Channel '${channel_id}' not found` }));
                    return;
                }

                userConnections[sender] = ws;

                if (!channelsData[channel_id].includes(String(sender))) {
                    ws.send(JSON.stringify({ error: `User '${sender}' is not part of channel '${channel_id}'` }));
                    return;
                }

          
                const history = await loadChatHistoryByChannelId(channel_id);
                ws.send(JSON.stringify({ history }));

                return; 
            }

            if (!channelsData[channel_id]) {
                ws.send(JSON.stringify({ error: `Channel '${channel_id}' not found` }));
                return;
            }

        
            const newMessage = { sender, message };
            channelsData[channel_id].forEach((user) => {
                if (userConnections[user] && userConnections[user].readyState === WebSocket.OPEN) {
                    userConnections[user].send(JSON.stringify({ channel_id, sender, message }));
                }
            });

    
            await saveMessageToAPI(sender, channel_id, message, seed || 1); 

        } catch (error) {
            console.error("Error processing message:", error);
            ws.send(JSON.stringify({ error: "Failed to process message" }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');

        for (let user in userConnections) {
            if (userConnections[user] === ws) {
                delete userConnections[user];
                break;
            }
        }
    });
});
