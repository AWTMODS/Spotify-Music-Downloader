const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const AdmZip = require('adm-zip');
const path = require('path');

// Replace with your Telegram bot token
const token = '8017123987:AAH2_Kko-W3iCSbRIQ-02Xb0vIFR83yIgGo';
const bot = new TelegramBot(token, { polling: true });

// Base URL for the Spotify Downloader API
const SPOTIFY_API_URL = 'https://spotifyalpha-zeta.vercel.app/download';

// User data file
const USERS_FILE = 'users.json';
let users = [];

// Admin's private channel ID
const ADMIN_CHANNEL_ID = -1002433715335;

// Required channel
const REQUIRED_CHANNEL = '@awt_bots';

// Language file
const LANG_FILE = 'lang.json';
let lang = {};

// Load language translations
if (fs.existsSync(LANG_FILE)) {
    try {
        const fileData = fs.readFileSync(LANG_FILE, 'utf8');
        lang = JSON.parse(fileData);
    } catch (error) {
        console.error("Error reading lang.json:", error);
        lang = {};
    }
} else {
    lang = {
        en: {
            welcome: "Welcome! Send me a Spotify track, album, or playlist URL to download.",
            joinChannel: "You must join our channel to use this bot.",
            thankYou: "Thank you for joining! You can now use the bot.",
            notJoined: "You have not joined yet. Please join and then click the button again.",
            downloadingTrack: "Downloading your track 🎵",
            downloadingPlaylist: "Fetching playlist tracks...",
            downloadingAlbum: "Fetching album tracks...",
            foundTracks: "Found {count} tracks. Starting download...",
            downloadComplete: "Download complete!",
            invalidUrl: "Please send a valid Spotify track, album, or playlist URL.",
            broadcastPrompt: "Send the message (text, image, or video) to broadcast.",
            broadcastSent: "Broadcast sent successfully.",
            languageSet: "Language set to {language}.",
            chooseLanguage: "Choose your preferred language:",
        },
        es: {
            welcome: "¡Bienvenido! Envíame una URL de Spotify (canción, álbum o lista de reproducción) para descargar.",
            joinChannel: "Debes unirte a nuestro canal para usar este bot.",
            thankYou: "¡Gracias por unirte! Ahora puedes usar el bot.",
            notJoined: "Aún no te has unido. Por favor, únete y luego haz clic en el botón nuevamente.",
            downloadingTrack: "Descargando tu canción 🎵",
            downloadingPlaylist: "Obteniendo canciones de la lista de reproducción...",
            downloadingAlbum: "Obteniendo canciones del álbum...",
            foundTracks: "Se encontraron {count} canciones. Comenzando la descarga...",
            downloadComplete: "¡Descarga completada!",
            invalidUrl: "Por favor, envía una URL válida de Spotify (canción, álbum o lista de reproducción).",
            broadcastPrompt: "Envía el mensaje (texto, imagen o video) para transmitir.",
            broadcastSent: "Mensaje transmitido con éxito.",
            languageSet: "Idioma cambiado a {language}.",
            chooseLanguage: "Elige tu idioma preferido:",
        },
    };
    fs.writeFileSync(LANG_FILE, JSON.stringify(lang, null, 2));
}

// Load existing users from users.json
if (fs.existsSync(USERS_FILE)) {
    try {
        const fileData = fs.readFileSync(USERS_FILE, 'utf8');
        users = JSON.parse(fileData);
        if (!Array.isArray(users)) users = [];
    } catch (error) {
        console.error("Error reading users.json:", error);
        users = [];
    }
} else {
    users = [];
}

// Save users to file
const saveUsers = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// Function to get a translated message
const getTranslation = (userId, key, placeholders = {}) => {
    const userLang = users.find(u => u.id === userId)?.language || 'en';
    let message = lang[userLang]?.[key] || lang.en[key];
    for (const [placeholder, value] of Object.entries(placeholders)) {
        message = message.replace(`{${placeholder}}`, value);
    }
    return message;
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
const sendTempMessage = async (chatId, userId, key, placeholders = {}) => {
    const text = getTranslation(userId, key, placeholders);
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
        const joinMessage = await bot.sendMessage(chatId, getTranslation(userId, 'joinChannel'), {
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
    if (!users.find(u => u.id === userId)) {
        users.push({ id: userId, language: 'en' });
        saveUsers();

        // Notify admin about the new user
        await bot.sendMessage(ADMIN_CHANNEL_ID, `New user started bot: ${userId}`);

        // Send the users.json file to the admin's channel
        try {
            await bot.sendDocument(ADMIN_CHANNEL_ID, USERS_FILE, {
                caption: `Updated users.json file. Total users: ${users.length}`,
            });
        } catch (error) {
            console.error("Error sending users.json file to admin:", error.message);
        }
    }

    // Send welcome message and delete it after 30 seconds
    sendTempMessage(chatId, userId, 'welcome');
});

// Handle "I Have Joined" button click
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === "check_subscription") {
        const isSubscribed = await isUserSubscribed(userId);
        if (isSubscribed) {
            const thankYouMessage = await bot.sendMessage(chatId, getTranslation(userId, 'thankYou'));
            setTimeout(() => bot.deleteMessage(chatId, thankYouMessage.message_id).catch(() => {}), 30000);
        } else {
            sendTempMessage(chatId, userId, 'notJoined');
        }
    }
});

// Handle /language command
bot.onText(/\/language/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    await bot.sendMessage(chatId, getTranslation(userId, 'chooseLanguage'), {
        reply_markup: {
            inline_keyboard: [
                [{ text: "English", callback_data: "set_lang_en" }],
                [{ text: "Español", callback_data: "set_lang_es" }]
            ]
        }
    });
});

// Handle language selection
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data.startsWith("set_lang_")) {
        const language = query.data.replace("set_lang_", "");
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            users[userIndex].language = language;
            saveUsers();
        }
        await bot.sendMessage(chatId, getTranslation(userId, 'languageSet', { language }));
    }
});

// Function to download a single track
const downloadTrack = async (chatId, userId, trackUrl) => {
    try {
        const loadingMessage = await bot.sendMessage(chatId, getTranslation(userId, 'downloadingTrack'));

        const apiUrl = `${SPOTIFY_API_URL}?url=${encodeURIComponent(trackUrl)}`;
        const response = await axios.get(apiUrl, { responseType: 'stream' });

        await bot.sendAudio(chatId, response.data, { caption: 'Downloaded by @awt_spotifymusic_bot' });

        bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});
    } catch (error) {
        console.error("Error downloading track:", error.message);
        sendTempMessage(chatId, userId, 'invalidUrl');
    }
};

// Function to download a collection (playlist or album)
const downloadCollection = async (chatId, userId, collectionUrl, type) => {
    try {
        const loadingMessage = await bot.sendMessage(chatId, getTranslation(userId, type === 'playlist' ? 'downloadingPlaylist' : 'downloadingAlbum'));

        const apiUrl = `${SPOTIFY_API_URL}?url=${encodeURIComponent(collectionUrl)}`;
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

        // Save the ZIP file temporarily
        const zipFilePath = path.join(__dirname, 'collection.zip');
        fs.writeFileSync(zipFilePath, response.data);

        // Extract the ZIP file
        const zip = new AdmZip(zipFilePath);
        const zipEntries = zip.getEntries();

        await bot.editMessageText(getTranslation(userId, 'foundTracks', { count: zipEntries.length }), {
            chat_id: chatId,
            message_id: loadingMessage.message_id
        });

        // Send each audio file
        for (let i = 0; i < zipEntries.length; i++) {
            const entry = zipEntries[i];
            if (!entry.isDirectory && entry.entryName.endsWith('.mp3')) {
                const audioBuffer = entry.getData();
                await bot.sendAudio(chatId, audioBuffer, { caption: 'Downloaded by @awt_spotifymusic_bot' });

                // Update progress
                await bot.editMessageText(getTranslation(userId, 'foundTracks', { count: zipEntries.length }) + `\nProgress: ${i + 1}/${zipEntries.length}`, {
                    chat_id: chatId,
                    message_id: loadingMessage.message_id
                });
            }
        }

        // Clean up the ZIP file
        fs.unlinkSync(zipFilePath);

        bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});
    } catch (error) {
        console.error("Error downloading collection:", error.message);
        sendTempMessage(chatId, userId, 'invalidUrl');
    }
};

// Handle Spotify track, album, and playlist URLs
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || "";

    // Ignore non-text messages and prevent processing /start as normal text
    if (!text || text.startsWith("/start")) return;

    // Check if the user is subscribed
    const isSubscribed = await isUserSubscribed(userId);
    if (!isSubscribed) {
        const joinMessage = await bot.sendMessage(chatId, getTranslation(userId, 'joinChannel'), {
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
        await downloadTrack(chatId, userId, text);
    }
    // Check if it's a Spotify playlist URL
    else if (text.startsWith('https://open.spotify.com/playlist/')) {
        await downloadCollection(chatId, userId, text, 'playlist');
    }
    // Check if it's a Spotify album URL
    else if (text.startsWith('https://open.spotify.com/album/')) {
        await downloadCollection(chatId, userId, text, 'album');
    } else {
        sendTempMessage(chatId, userId, 'invalidUrl');
    }
});

// Broadcast feature (Admin only)
bot.onText(/\/broadcast/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (chatId.toString() !== ADMIN_CHANNEL_ID) {
        return bot.sendMessage(chatId, getTranslation(userId, 'broadcastPrompt'));
    }

    bot.sendMessage(chatId, getTranslation(userId, 'broadcastPrompt'));

    bot.once('message', async (broadcastMsg) => {
        const contentType = broadcastMsg.photo ? 'photo' : broadcastMsg.video ? 'video' : 'text';
        const broadcastText = broadcastMsg.text || ' ';
        const mediaId = (broadcastMsg.photo || broadcastMsg.video)?.pop()?.file_id;

        users.forEach((user) => {
            try {
                if (contentType === 'photo') {
                    bot.sendPhoto(user.id, mediaId, { caption: broadcastText });
                } else if (contentType === 'video') {
                    bot.sendVideo(user.id, mediaId, { caption: broadcastText });
                } else {
                    bot.sendMessage(user.id, broadcastText);
                }
            } catch (err) {
                console.error(`Failed to send message to ${user.id}:`, err.message);
            }
        });

        bot.sendMessage(chatId, getTranslation(userId, 'broadcastSent'));
    });
});

console.log('Bot is running...');
