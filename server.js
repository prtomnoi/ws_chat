
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
const chatRooms = {}; 

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (data) => {
    const { channel_id, sender, message } = JSON.parse(data);


    if (!chatRooms[channel_id]) chatRooms[channel_id] = [];
    chatRooms[channel_id].push({ sender, message });


    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ channel_id, sender, message }));
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('WebSocket server running on ws://localhost:8080');
