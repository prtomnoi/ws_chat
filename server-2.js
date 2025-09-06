// server.js
const WebSocket = require('ws');
const axios = require('axios');

// ===== Config =====
const CHAT_HISTORY_API_URL = 'https://cleanmate.dekesandev.com/api/chat/ChannelById/';
const SEND_MESSAGE_API_URL = 'https://cleanmate.dekesandev.com/api/chat/sendMessage';

// ===== In-memory store =====
const channelUsers = {};      // { [channelId]: Set<userId> }
const userConnections = {};   // { [userId]: WebSocket }

// ===== UUID (custom, Node12 compatible) =====
function uuidv4Custom() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ===== Helpers =====
function broadcastToChannel(channel_id, payload) {
  if (!channelUsers[channel_id]) return;
  channelUsers[channel_id].forEach(function (uid) {
    const sock = userConnections[uid];
    if (sock && sock.readyState === WebSocket.OPEN) {
      try {
        sock.send(JSON.stringify(payload));
      } catch (e) {
        console.error('broadcast error to', uid, e && e.message);
      }
    }
  });
}

// ส่ง single ไป API — ใช้ seed จาก client ตรงๆ
async function saveMessageToAPI(user_id, chat_channel_id, message, seed, msgType, file_url, group_id) {
  try {
    const payload = {
      user_id: user_id,
      chat_channel_id: chat_channel_id,
      message: message ?? null,
      seed: seed,                 // <<<< ใช้ตามที่ client ส่งมา
      type: msgType,
      file_url: file_url ?? null,
      group_id: group_id ?? null,
    };
    const resp = await axios.post(SEND_MESSAGE_API_URL, payload);
    console.log('payload saved to API:', payload);
    console.log('Message saved to API:', resp && resp.data ? resp.data : resp.status);
  } catch (error) {
    console.error(
      'Error saving message to API:',
      error && error.response ? error.response.data : (error && error.message ? error.message : error)
    );
  }
}

// ส่ง multi ไป API — ส่ง items ตรงๆ ตามที่ client ส่งมา (ไม่ map/แก้โครง)
async function saveMessagesBulkToAPI(user_id, chat_channel_id, seed, items, group_id) {
  try {
    const payload = {
      user_id: user_id,
      chat_channel_id: chat_channel_id,
      seed: seed,               // <<<< ใช้ตามที่ client ส่งมา
      group_id: group_id ?? null,
      items: items,             // <<<< ส่งตามที่ client ส่งมา (คงทั้ง type2, seed ต่อ item ฯลฯ)
    };
    const resp = await axios.post(SEND_MESSAGE_API_URL, payload);
    console.log('bulk saved:', payload, resp && resp.data ? resp.data : resp.status);
  } catch (e) {
    console.error('bulk save error:', e && e.response ? e.response.data : e.message);
  }
}

async function loadChatHistoryByChannelId(channel_id) {
  try {
    const resp = await axios.get(CHAT_HISTORY_API_URL + channel_id);
    const data = resp && resp.data ? resp.data : null;

    if (process.env.DEBUG_WS === '1') {
      try { console.log('[history raw]', JSON.stringify(data).slice(0, 800)); }
      catch (e) { console.log('[history raw]', '[unserializable]'); }
    }

    let items = [];
    if (data && Array.isArray(data.messages)) items = data.messages;
    else if (data && Array.isArray(data.message)) items = data.message;
    else items = [];

    return items; // ส่งต่อให้ client ใช้ได้เลย
  } catch (error) {
    console.error(
      'Error fetching chat history for channel', channel_id, ':',
      error && error.message ? error.message : error
    );
    return [];
  }
}

// ===== WebSocket Server =====
const wss = new WebSocket.Server({ port: 8081 });
console.log('WebSocket server running on ws://localhost:8081');

wss.on('connection', function (ws) {
  console.log('New client connected');

  ws.on('message', async function (data) {
    try {
      const parsed = JSON.parse(data);
      console.log('[recv]', parsed);

      const channel_id = parsed.channel_id;
      const sender     = parsed.sender;
      const type       = parsed.type;      // 'join' | 'message'
      const type2      = parsed.type2;     // 'text' | 'image' | ...
      const message    = parsed.message;
      const file_url   = parsed.file_url;
      const seed       = parsed.seed;      // <<<< ใช้ตามที่ client ส่งมา
      const itemsArr   = (parsed && Array.isArray(parsed.items)) ? parsed.items : null;

      if (!channel_id || !sender) {
        ws.send(JSON.stringify({ error: 'Missing required properties: channel_id/sender' }));
        return;
      }

      // ---- JOIN -----------------------------------------------------------
      if (type === 'join') {
        userConnections[sender] = ws;
        if (!channelUsers[channel_id]) channelUsers[channel_id] = new Set();
        channelUsers[channel_id].add(sender);

        const history = await loadChatHistoryByChannelId(channel_id);
        ws.send(JSON.stringify({ history }));
        return;
      }

      // ---- MULTI (batch) --------------------------------------------------
      if (itemsArr && itemsArr.length > 0) {
        const batchId = uuidv4Custom();
        const outgoings = [];

        for (let i = 0; i < itemsArr.length; i++) {
          const it    = itemsArr[i] || {};
          const mType = it.type2 || it.type || 'text';
          const mText = it.message || null;
          const mUrl  = it.file_url || null;
          const mSeed = (typeof it.seed !== 'undefined') ? it.seed : seed; // ให้สิทธิ์ item.seed ก่อน

          if (mType === 'text' && (!mText || String(mText).trim() === '')) continue;
          if (mType !== 'text' && !mUrl) continue;

          outgoings.push({
            channel_id: channel_id,
            sender: sender,
            seed: mSeed,            // <<<< ส่ง seed ราย item ที่ client ให้มา
            type: mType,
            type2: mType,
            message: mText,
            file_url: mUrl,
            group_id: batchId,
          });
        }

        if (outgoings.length > 0) {
          // broadcast แบบก้อนเดียว (client ต้อง handle event=batch)
          broadcastToChannel(channel_id, {
            event: 'batch',
            channel_id: channel_id,
            sender: sender,
            seed: seed,            // <<<< ใช้ตามที่ client ส่งมา (envelope)
            group_id: batchId,
            items: outgoings,
          });

          // บันทึกแบบ bulk ส่ง items “ตามที่ client ส่งมา” และคง seed ที่ client ให้มา
          await saveMessagesBulkToAPI(sender, channel_id, seed, itemsArr, batchId);
        }
        return;
      }

      // ---- SINGLE ---------------------------------------------------------
      const msgType = type2 || 'text';
      if (msgType !== 'text' && !file_url) {
        ws.send(JSON.stringify({ error: 'file_url is required when type2=' + msgType }));
        return;
      }
      if (msgType === 'text' && (!message || String(message).trim() === '')) {
        ws.send(JSON.stringify({ error: 'message is required for type2=text' }));
        return;
      }

      const outgoing = {
        channel_id,
        sender,
        seed: seed,                 // <<<< ใช้ seed ตรงๆ
        type: msgType,
        type2: msgType,
        message: message ?? null,
        file_url: file_url ?? null,
        group_id: null,
      };

      broadcastToChannel(channel_id, outgoing);
      await saveMessageToAPI(sender, channel_id, message ?? null, seed, msgType, file_url ?? null, null);

    } catch (err) {
      console.error('Error processing message:', err && err.message ? err.message : err);
      try { ws.send(JSON.stringify({ error: 'Failed to process message' })); } catch (e) {}
    }
  });

  ws.on('close', function () {
    console.log('Client disconnected');
    let removedUid = null;
    for (let uid in userConnections) {
      if (userConnections[uid] === ws) {
        removedUid = uid;
        delete userConnections[uid];
        break;
      }
    }
    if (removedUid) {
      for (let ch in channelUsers) {
        channelUsers[ch].delete(removedUid);
        if (channelUsers[ch].size === 0) delete channelUsers[ch];
      }
    }
  });
});
