const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Replace with your Telegram bot token
const token = '8017123987:AAH2_Kko-W3iCSbRIQ-02Xb0vIFR83yIgGo';
const bot = new TelegramBot(token, { polling: true });

// Base URL for the Spotify Downloader API
const SPOTIFY_API_URL = 'https://spotifyalpha-zeta.vercel.app/download';

// User data file
const USERS_FILE = 'users.js';
let users = [];

// Admin's private channel ID
const ADMIN_CHANNEL_ID = -1002433715335;

// Required channel
const REQUIRED_CHANNEL = '@awt_bots';

// Load existing users from users.js
if (fs.existsSync(USERS_FILE)) {
    try {
        const fileData = fs.readFileSync(USERS_FILE, 'utf8');
        users = JSON.parse(fileData);
        if (!Array.isArray(users)) users = [];
    } catch (error) {
        console.error("Error reading users.js:", error);
        users = [];
    }
} else {
    users = [];
}

// Save users to file
const saveUsers = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// Function to check if a user is subscribed
const isUserSubscribed = async (userId) => {
    try {
        const chatMember = await bot.getChatMember(REQUIRED_CHANNEL, userId);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
        console.error("Error checking subscription:", error.message);
        return false;
    }
};

// Function to send a message and delete it after 30 seconds
const sendTempMessage = async (chatId, text) => {
    const msg = await bot.sendMessage(chatId, text);
    setTimeout(() => {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }, 30000);
};

// Handle the /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if the user is subscribed
    const isSubscribed = await isUserSubscribed(userId);
    if (!isSubscribed) {
        const joinMessage = await bot.sendMessage(chatId, `You must join our channel to use this bot.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }],
                    [{ text: "I Have Joined ✅", callback_data: "check_subscription" }]
                ]
            }
        });

        // Delete join message after 30 seconds
        setTimeout(() => bot.deleteMessage(chatId, joinMessage.message_id).catch(() => {}), 30000);
        return;
    }

    // Save user ID if not already saved
    if (!users.includes(userId)) {
        users.push(userId);
        saveUsers();

        // Notify admin about the new user
        bot.sendMessage(ADMIN_CHANNEL_ID, `New user started bot: ${userId}`);
    }

    // Send welcome message and delete it after 30 seconds
    sendTempMessage(chatId, 'Welcome! Send me a Spotify track URL to download the track.');
});

// Handle "I Have Joined" button click
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === "check_subscription") {
        const isSubscribed = await isUserSubscribed(userId);
        if (isSubscribed) {
            const thankYouMessage = await bot.sendMessage(chatId, "Thank you for joining! You can now use the bot.");
            setTimeout(() => bot.deleteMessage(chatId, thankYouMessage.message_id).catch(() => {}), 30000);
        } else {
            sendTempMessage(chatId, "You have not joined yet. Please join and then click the button again.");
        }
    }
});

// Handle Spotify track URLs
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Ignore non-text messages and prevent processing /start as normal text
    if (!text || text.startsWith("/start")) return;

    // Check if the user is subscribed
    const isSubscribed = await isUserSubscribed(msg.from.id);
    if (!isSubscribed) {
        const joinMessage = await bot.sendMessage(chatId, `You must join our channel to use this bot.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }],
                    [{ text: "I Have Joined ✅", callback_data: "check_subscription" }]
                ]
            }
        });

        setTimeout(() => bot.deleteMessage(chatId, joinMessage.message_id).catch(() => {}), 30000);
        return;
    }

    // Check if it's a Spotify track URL
    if (text.startsWith('https://open.spotify.com/track/')) {
        try {
            const loadingMessages = ["Downloading your track 🎵", "Downloading your track 🎶", "Downloading your track 🔄"];
            let loadingIndex = 0;
            const loadingMessage = await bot.sendMessage(chatId, loadingMessages[loadingIndex]);

            const animationInterval = setInterval(async () => {
                loadingIndex = (loadingIndex + 1) % loadingMessages.length;
                await bot.editMessageText(loadingMessages[loadingIndex], {
                    chat_id: chatId,
                    message_id: loadingMessage.message_id
                });
            }, 1000);

            const apiUrl = `${SPOTIFY_API_URL}?url=${encodeURIComponent(text)}`;
            const response = await axios.get(apiUrl, { responseType: 'stream' });

            await bot.sendAudio(chatId, response.data, { caption: 'Downloaded by @awt_spotifymusic_bot' });

            clearInterval(animationInterval);
            bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});
        } catch (error) {
            sendTempMessage(chatId, 'Failed to download the track. Please try again later.');
        }
    } else {
        sendTempMessage(chatId, 'Please send a valid Spotify track URL.');
    }
});

// Broadcast feature (Admin only)
bot.onText(/\/broadcast/, async (msg) => {
    const chatId = msg.chat.id;

    if (chatId.toString() !== ADMIN_CHANNEL_ID) {
        return bot.sendMessage(chatId, 'Only the admin can use this command.');
    }

    bot.sendMessage(chatId, 'Send the message (text, image, or video) to broadcast.');
    
    bot.once('message', async (broadcastMsg) => {
        const contentType = broadcastMsg.photo ? 'photo' : broadcastMsg.video ? 'video' : 'text';
        const broadcastText = broadcastMsg.text || ' ';
        const mediaId = (broadcastMsg.photo || broadcastMsg.video)?.pop()?.file_id;

        users.forEach((userId) => {
            try {
                if (contentType === 'photo') {
                    bot.sendPhoto(userId, mediaId, { caption: broadcastText });
                } else if (contentType === 'video') {
                    bot.sendVideo(userId, mediaId, { caption: broadcastText });
                } else {
                    bot.sendMessage(userId, broadcastText);
                }
            } catch (err) {
                console.error(`Failed to send message to ${userId}:`, err.message);
            }
        });

        bot.sendMessage(chatId, 'Broadcast sent successfully.');
    });
});

console.log('Bot is running...');
