// --- 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    onChildAdded, 
    onChildChanged, 
    onChildRemoved,
    onValue,
    push, 
    serverTimestamp, 
    set,
    remove,
    get,
    onDisconnect, 
    update,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// ************************************************************
// ** CONFIGURACIÓN DE TU BASE DE DATOS **
// ************************************************************
const firebaseConfig = {
    apiKey: "AIzaSyA-ODwm4wUWYsfbgtmy4jelIPlsZsCQ4Ck",
    authDomain: "sigma-xat2.firebaseapp.com",
    databaseURL: "https://sigma-xat2-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "sigma-xat2",
    storageBucket: "sigma-xat2-firebasestorage.app", // Corregido el nombre del bucket
    messagingSenderId: "419112986768",
    appId: "1:419112986768:web:e930c6c22445295b871015",
    measurementId: "G-98YHEDL7YT"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const messagesRef = ref(database, 'messages');
const typingRef = ref(database, 'typing');
const usersRef = ref(database, 'users'); 


// --- 2. REFERENCIAS A ELEMENTOS DEL DOM ---
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');
const homeButton = document.getElementById('home-button');
const clearAllButton = document.getElementById('clear-all-button');
const emojiButton = document.getElementById('emoji-button');
const replyPreview = document.getElementById('reply-preview');
const cancelReplyButton = document.getElementById('cancel-reply');
const emojiPickerContainer = document.getElementById('emoji-picker-container'); 
const logoutButton = document.getElementById('logout-button');
const typingIndicator = document.getElementById('typing-indicator');

// NUEVOS ELEMENTOS DE UI
const conversationsContainer = document.getElementById('conversations-container');
const chatRoomPanel = document.getElementById('chat-room-panel');
const chatHeader = document.querySelector('.chat-header');
const currentChatName = document.getElementById('current-chat-name');
const usernameDisplay = document.getElementById('username-display');
const contactStatusText = document.getElementById('contact-status-text'); 
const chatContactAvatar = document.getElementById('chat-contact-avatar'); 


// --- 3. VARIABLES DE ESTADO ---
let currentUser = sessionStorage.getItem('username');
let replyTo = null;
let typingTimeout = null;
let seenIntervals = {};
let allMessages = {}; 
let activeChatUser = null; 
let USERS_STATUS = {}; 
let CONTACTS_MAP = {}; 
let isTypingActive = false; 
let CHAT_KEYS = {}; // Para almacenar las claves de cifrado

// NUEVAS VARIABLES PARA PAGINACIÓN Y OPTIMIZACIÓN
const MESSAGES_PER_PAGE = 15; // Lote de 15 mensajes
let chatMessageIds = []; // IDs de mensajes relevantes para el chat activo, ordenados por tiempo
let loadedMessageCount = 0; // Número de mensajes cargados actualmente
let isLoadingMore = false; // Bandera para evitar múltiples cargas


// --- 4. FUNCIONES DE CRIPTOGRAFÍA ---

// Obtiene un ID consistente para derivar la clave (ej: "alice:bob")
function getChatKeyIdentifier(user1, user2) {
    const users = [user1.toLowerCase(), user2.toLowerCase()].sort();
    return users.join(':'); 
}

// Deriva una clave AES-GCM 256 de una frase de clave (el ID del chat)
async function deriveKey(keyIdentifier) {
    const encoder = new TextEncoder();
    
    // Importar la frase clave como material para PBKDF2
    const material = await crypto.subtle.importKey(
        'raw', 
        encoder.encode(keyIdentifier), 
        { name: 'PBKDF2' }, 
        false, 
        ['deriveKey']
    );
    
    // Usar un salt fijo (en producción se usaría un salt único para cada par)
    const salt = encoder.encode('sigma-chat-salt'); 

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000, 
            hash: 'SHA-256',
        },
        material,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// Cifra el texto con la clave
async function encrypt(text, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Vector de inicialización (IV): DEBE ser aleatorio y único para cada mensaje.
    const iv = crypto.getRandomValues(new Uint8Array(12)); 

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
    );

    // Devolver el texto cifrado y el IV en Base64 para almacenarlos en Firebase
    return {
        text: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv)),
    };
}

// Descifra el texto con la clave y el IV
async function decrypt(encryptedText, ivBase64, key) {
    try {
        // Convertir Base64 de vuelta a ArrayBuffer
        const ciphertext = new Uint8Array(atob(encryptedText).split('').map(char => char.charCodeAt(0))).buffer;
        const iv = new Uint8Array(atob(ivBase64).split('').map(char => char.charCodeAt(0)));

        const decryptedData = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    } catch (e) {
        // Si no se puede descifrar (clave incorrecta, datos corruptos), devolver aviso.
        return `[ERROR: Mensaje cifrado. No se pudo descifrar.]`;
    }
}

// Función central para descifrar un objeto de mensaje
async function processMessageForDisplay(message) {
    // Si no está marcado como cifrado o le faltan partes, devolver tal cual
    if (!message.encrypted || !message.text || !message.iv) {
        return { ...message, text: message.text || '[Mensaje vacío o no cifrado]' };
    }
    
    // 1. Obtener la clave
    const keyId = getChatKeyIdentifier(message.sender, message.receiver);
    let chatKey = CHAT_KEYS[keyId];

    if (!chatKey) {
        // Derivar la clave si no la tenemos
        chatKey = await deriveKey(keyId);
        CHAT_KEYS[keyId] = chatKey;
    }

    // 2. Descifrar
    const decryptedText = await decrypt(message.text, message.iv, chatKey);
    
    // 3. Devolver el mensaje con el texto descifrado
    return { ...message, text: decryptedText };
}


// --- 5. FUNCIONES DE UTILIDAD ---

const caseInsensitiveEquals = (str1, str2) => {
    if (!str1 || !str2) return str1 === str2;
    return String(str1).toLowerCase() === String(str2).toLowerCase();
};

function getTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days >= 7) return new Date(timestamp).toLocaleDateString();
    if (seconds < 60) return 'justo ahora';
    if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}


// Esta función no necesita descifrar, ya que solo necesita metadatos (timestamp, read)
function getLatestConversationData(partner) {
    let latestMessage = null;
    let latestTimestamp = 0;
    let unreadCount = 0;

    for (const id in allMessages) {
        const msg = allMessages[id];
        
        const isRelevant = 
            (caseInsensitiveEquals(msg.sender, currentUser) && caseInsensitiveEquals(msg.receiver, partner)) ||
            (caseInsensitiveEquals(msg.sender, partner) && caseInsensitiveEquals(msg.receiver, currentUser));
            
        if (isRelevant) {
            const timestamp = msg.timestamp || 0;
            
            if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp;
                latestMessage = msg;
            }

            if (caseInsensitiveEquals(msg.sender, partner) && 
                caseInsensitiveEquals(msg.receiver, currentUser) && 
                !msg.read) {
                unreadCount++;
            }
        }
    }
    
    return { latestMessage, latestTimestamp, unreadCount };
}


// --- 6. GESTIÓN DE AUTENTICACIÓN Y NAVEGACIÓN ---
if (!currentUser) {
    window.location.href = 'nnn.html'; 
} else {
    if (usernameDisplay) usernameDisplay.textContent = currentUser;
    setupUserPresence(); 
}

function setupUserPresence() {
    const userStatusRef = ref(database, `users/${currentUser}`);

    set(userStatusRef, {
        isOnline: true,
        lastSeen: serverTimestamp() 
    });

    onDisconnect(userStatusRef).set({
        isOnline: false,
        lastSeen: serverTimestamp() 
    });
    
    onValue(usersRef, (snapshot) => {
        USERS_STATUS = {};
        const tempUsersMap = {}; 
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const username = childSnapshot.key;
                const status = childSnapshot.val();
                USERS_STATUS[username] = status;
                
                if (!caseInsensitiveEquals(username, currentUser)) {
                    
                    const { latestMessage, latestTimestamp, unreadCount } = getLatestConversationData(username);
                    
                    if (latestMessage || status.isOnline) { 
                        tempUsersMap[username] = {
                            username: username,
                            timestamp: latestTimestamp || status.lastSeen || Date.now(),
                            unread: unreadCount,
                        };
                    }
                }
            });
        }

        CONTACTS_MAP = tempUsersMap; 
        
        renderConversationsList();
        updateChatHeaderStatus(); 
    });
}

function updateChatHeaderStatus() {
    if (!activeChatUser || !contactStatusText) return;
    
    if (typingIndicator && typingIndicator.style.display !== 'none' && contactStatusText.textContent === 'Escribiendo...') {
        return; 
    }

    const status = USERS_STATUS[activeChatUser];

    if (status && status.isOnline) {
        contactStatusText.textContent = 'En línea';
        contactStatusText.className = 'contact-status-text online';
    } else if (status && status.lastSeen) {
        contactStatusText.textContent = `Última vez ${getTimeAgo(status.lastSeen)}`; 
        contactStatusText.className = 'contact-status-text offline';
    } else {
        contactStatusText.textContent = 'Desconectado';
        contactStatusText.className = 'contact-status-text offline';
    }
}


if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        set(ref(database, `users/${currentUser}`), { isOnline: false, lastSeen: Date.now() })
            .then(() => {
                sessionStorage.removeItem('username');
                window.location.href = 'nnn.html'; 
            });
    });
}

if (homeButton) {
    homeButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
}

if (chatHeader) {
    let backButton = chatHeader.querySelector('.mobile-back-button');
    if (!backButton) {
        backButton = document.createElement('button');
        backButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
        backButton.title = 'Volver a Chats';
        backButton.className = 'mobile-back-button';
        
        backButton.onclick = () => {
            if (chatRoomPanel) chatRoomPanel.classList.remove('active');
            closeAllMessageActions();
            if (emojiPickerContainer) emojiPickerContainer.classList.remove('active'); 
        };
        const contactInfo = chatHeader.querySelector('.contact-info');
        if (contactInfo) {
            contactInfo.prepend(backButton);
        } else {
            chatHeader.prepend(backButton); 
        }
    } else {
         backButton.onclick = () => {
            if (chatRoomPanel) chatRoomPanel.classList.remove('active');
            closeAllMessageActions();
            if (emojiPickerContainer) emojiPickerContainer.classList.remove('active');
        };
    }
}

// ------------------------------------------------------------------
// --- 7. LÓGICA DE LA LISTA DE CONVERSACIONES ---
// ------------------------------------------------------------------

function formatTimeForList(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Ayer';
    }
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function renderConversationsList() {
    if (!conversationsContainer) return;

    conversationsContainer.innerHTML = '';
    
    const sortedContacts = Object.values(CONTACTS_MAP).sort((a, b) => b.timestamp - a.timestamp);
    
    sortedContacts.forEach(contact => {
        if (caseInsensitiveEquals(contact.username, currentUser)) return;

        if (contact.unread === undefined) { 
             const latestData = getLatestConversationData(contact.username);
             contact.timestamp = latestData.latestTimestamp || contact.timestamp;
             contact.unread = latestData.unreadCount;
        }

        const item = document.createElement('div');
        const isActive = activeChatUser && caseInsensitiveEquals(contact.username, activeChatUser);
        item.className = `conversation-item ${isActive ? 'active' : ''}`;
        item.dataset.targetUser = contact.username;
        
        const status = USERS_STATUS[contact.username];
        const isOnline = status && status.isOnline;
        
        // MODIFICACIÓN: Solo mostrar el número de no leídos (o un espacio)
        item.innerHTML = `
            <div class="contact-avatar ${isOnline ? 'online' : ''}"></div> 
            <div class="chat-details">
                <span class="chat-name">${contact.username}</span>
                <p class="last-message">
                    ${contact.unread > 0 ? `<span class="unread-count-placeholder">Mensajes nuevos</span>` : '&nbsp;'}
                </p>
            </div>
            <div class="chat-meta">
                <span class="last-time">${formatTimeForList(contact.timestamp)}</span>
                ${contact.unread > 0 ? `<span class="unread-count">${contact.unread > 99 ? '99+' : contact.unread}</span>` : ''}
            </div>
        `;

        item.addEventListener('click', () => {
            setActiveChat(contact.username);
            if (window.innerWidth <= 900 && chatRoomPanel) {
                 chatRoomPanel.classList.add('active');
            }
        });

        conversationsContainer.appendChild(item);
    });
}

function setActiveChat(username) {
    for (const id in seenIntervals) {
        clearInterval(seenIntervals[id]);
    }
    seenIntervals = {};
    
    activeChatUser = username;
    if (currentChatName) currentChatName.textContent = username;
    if (chatContactAvatar) chatContactAvatar.textContent = username.charAt(0).toUpperCase();

    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (caseInsensitiveEquals(item.dataset.targetUser, username)) {
            item.classList.add('active');
        }
    });

    if (chatMessages) {
        chatMessages.innerHTML = '';
        chatMessages.removeEventListener('scroll', handleChatScroll); 
        chatMessages.addEventListener('scroll', handleChatScroll);
    }
    
    // --- LÓGICA DE PAGINACIÓN ---
    chatMessageIds = [];
    for (const id in allMessages) {
        const msg = allMessages[id];
        
        const isRelevant = 
            (caseInsensitiveEquals(msg.sender, currentUser) && caseInsensitiveEquals(msg.receiver, activeChatUser)) ||
            (caseInsensitiveEquals(msg.sender, activeChatUser) && caseInsensitiveEquals(msg.receiver, currentUser));
            
        if (isRelevant) {
            chatMessageIds.push({ id, timestamp: msg.timestamp || 0 });
        }
    }
    
    chatMessageIds.sort((a, b) => a.timestamp - b.timestamp);
    chatMessageIds = chatMessageIds.map(item => item.id);
    
    loadedMessageCount = 0; 

    loadMessages(true);
    // --- FIN LÓGICA DE PAGINACIÓN ---
    
    if (CONTACTS_MAP[username]) {
         CONTACTS_MAP[username].unread = 0;
         renderConversationsList();
    }
    
    updateChatHeaderStatus();
    
    setTimeout(() => {
        let updates = {};
        let readPerformed = false;
        
        for (const id in allMessages) {
            const msg = allMessages[id];
            
            if (caseInsensitiveEquals(msg.receiver, currentUser) && 
                caseInsensitiveEquals(msg.sender, activeChatUser) && 
                !msg.read) 
            {
                updates[`messages/${id}/read`] = true;
                updates[`messages/${id}/readAt`] = Date.now();
                readPerformed = true;
            }
        }
        
        if (readPerformed) {
            update(ref(database), updates)
                .catch(error => {
                    console.error("Error al marcar como leído:", error);
                });
        }
    }, 50); 
    
    clearTimeout(typingTimeout);
    isTypingActive = false; 
    typingTimeout = null;
}

// --------------------------------------------------------------------------
// --- 8. GESTIÓN DE MENSAJES EN TIEMPO REAL (onChildAdded, onChildChanged) ---
// --------------------------------------------------------------------------

onChildAdded(messagesRef, async (snapshot) => { 
    const messageId = snapshot.key;
    const message = snapshot.val();
    
    if (!message.receiver) {
        message.receiver = caseInsensitiveEquals(message.sender, currentUser) ? activeChatUser : currentUser; 
    }
    
    allMessages[messageId] = message; 

    const interactionPartner = caseInsensitiveEquals(message.sender, currentUser) ? message.receiver : message.sender;

    if(!interactionPartner || caseInsensitiveEquals(interactionPartner, currentUser)) return;
    
    const isDirectMessage = 
        (caseInsensitiveEquals(message.sender, currentUser) && caseInsensitiveEquals(message.receiver, interactionPartner)) ||
        (caseInsensitiveEquals(message.sender, interactionPartner) && caseInsensitiveEquals(message.receiver, currentUser));
    
    if(!isDirectMessage) return; 

    // 2. ACTUALIZAR LISTA DE CONTACTOS DINÁMICAMENTE (usando CONTACTS_MAP)
    let contact = CONTACTS_MAP[interactionPartner];
    
    if (!contact) {
        const status = USERS_STATUS[interactionPartner] || {};
        contact = {
            username: interactionPartner,
            timestamp: message.timestamp || Date.now(),
            unread: caseInsensitiveEquals(message.sender, currentUser) ? 0 : 1, 
            lastSeen: status.lastSeen || null,
            isOnline: status.isOnline || false
        };
        CONTACTS_MAP[interactionPartner] = contact;
    } else {
        contact.timestamp = message.timestamp || Date.now();
        
        if (!caseInsensitiveEquals(message.sender, currentUser) && 
            !caseInsensitiveEquals(interactionPartner, activeChatUser)) {
             contact.unread = (contact.unread || 0) + 1;
        }
    }
    
    renderConversationsList();

    // 3. MOSTRAR MENSAJE EN EL CHAT SI ESTÁ ABIERTO
    if (activeChatUser) {
        const isRelevant = 
            (caseInsensitiveEquals(message.sender, currentUser) && caseInsensitiveEquals(message.receiver, activeChatUser)) ||
            (caseInsensitiveEquals(message.sender, activeChatUser) && caseInsensitiveEquals(message.receiver, currentUser));

        if (isRelevant) {
            const index = chatMessageIds.findIndex(item => item === messageId);
            
            if (index === -1) {
                chatMessageIds.push(messageId);
                chatMessageIds.sort((a, b) => (allMessages[a].timestamp || 0) - (allMessages[b].timestamp || 0));
            }
            
            const messageIndex = chatMessageIds.findIndex(id => id === messageId);
            const isLatestMessage = messageIndex === chatMessageIds.length - 1;

            if (isLatestMessage && !document.getElementById(messageId)) {
                
                loadedMessageCount++;
                
                const isNearBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 200;
                
                await renderAndAppendMessage(messageId, message); // << LLAMADA ASÍNCRONA

                if (!caseInsensitiveEquals(message.sender, currentUser) && !message.read) {
                     setTimeout(() => {
                         if (caseInsensitiveEquals(interactionPartner, activeChatUser)) {
                             set(ref(database, `messages/${messageId}/read`), true);
                             set(ref(database, `messages/${messageId}/readAt`), Date.now());
                         }
                     }, 500); 
                }
                
                if (chatMessages && isNearBottom) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        }
    }
});

onChildChanged(messagesRef, async (snapshot) => { 
    const messageId = snapshot.key;
    const messageData = snapshot.val();
    allMessages[messageId] = messageData; 
    
    const interactionPartner = caseInsensitiveEquals(messageData.sender, currentUser) ? messageData.receiver : messageData.sender;

    if (activeChatUser) {
        const isRelevant = 
            (caseInsensitiveEquals(messageData.sender, currentUser) && caseInsensitiveEquals(messageData.receiver, activeChatUser)) ||
            (caseInsensitiveEquals(messageData.sender, activeChatUser) && caseInsensitiveEquals(messageData.receiver, currentUser));
                           
        if (isRelevant) {
            const oldMessageElement = document.getElementById(messageId);
            if (oldMessageElement) {
                 const parent = oldMessageElement.parentElement;
                 const nextSibling = oldMessageElement.nextSibling;
                 if (seenIntervals[messageId]) {
                    clearInterval(seenIntervals[messageId]);
                    delete seenIntervals[messageId];
                 }
                 oldMessageElement.remove();
                 
                 // Descifrar antes de crear el elemento
                 const decryptedMessage = await processMessageForDisplay(messageData); 

                 const newMessageWrapper = createMessageElement(messageId, decryptedMessage);
                 if (nextSibling) {
                     parent.insertBefore(newMessageWrapper, nextSibling);
                 } else {
                     parent.appendChild(newMessageWrapper);
                 }
                 const actionsDiv = newMessageWrapper.querySelector('.message-actions');
                 if (actionsDiv) setupMessageActions(newMessageWrapper, actionsDiv);
                 
                 if (caseInsensitiveEquals(messageData.sender, currentUser) && messageData.read && messageData.readAt) {
                    updateSeenIndicator(newMessageWrapper, messageData.readAt, messageId);
                 }
            }
        }
    }
    
    const isDirectMessage = 
        (caseInsensitiveEquals(messageData.sender, currentUser) && caseInsensitiveEquals(messageData.receiver, interactionPartner)) ||
        (caseInsensitiveEquals(messageData.sender, interactionPartner) && caseInsensitiveEquals(messageData.receiver, currentUser));
        
    if (isDirectMessage && interactionPartner && CONTACTS_MAP[interactionPartner]) {
         const contact = CONTACTS_MAP[interactionPartner];
         
         const { unreadCount } = getLatestConversationData(interactionPartner);
         
         if (contact.unread !== unreadCount) {
             contact.unread = unreadCount;
             renderConversationsList(); 
         }
    }
});

onChildRemoved(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    delete allMessages[messageId]; 
    
    const index = chatMessageIds.findIndex(id => id === messageId);
    if (index !== -1) {
        chatMessageIds.splice(index, 1);
        if (document.getElementById(messageId)) {
             loadedMessageCount--;
        }
    }
    
    if (seenIntervals[messageId]) {
        clearInterval(seenIntervals[messageId]);
        delete seenIntervals[messageId];
    }
    const messageElement = document.getElementById(messageId);
    if (messageElement) messageElement.remove();
    
    renderConversationsList(); 
});

// --------------------------------------------------------------------------
// --- 9. ENVÍO DE MENSAJES Y FUNCIONES AUXILIARES (MODIFICADA PARA CIFRADO)---
// --------------------------------------------------------------------------

if (messageForm && messageInput) {
    messageForm.addEventListener('submit', async (e) => { 
        e.preventDefault();
        const messageText = messageInput.value.trim();
        
        if (messageText === '') return; 
        if (!activeChatUser) {
            alert("Selecciona un chat primero");
            return;
        }

        // 1. Obtener/derivar la clave de cifrado
        const keyId = getChatKeyIdentifier(currentUser, activeChatUser);
        let chatKey = CHAT_KEYS[keyId];

        if (!chatKey) {
            chatKey = await deriveKey(keyId);
            CHAT_KEYS[keyId] = chatKey;
        }
        
        // 2. Cifrar el texto
        const encrypted = await encrypt(messageText, chatKey);

        const newMessage = {
            sender: currentUser,
            receiver: activeChatUser, 
            
            // GUARDAR DATOS CIFRADOS EN FIREBASE
            text: encrypted.text, 
            iv: encrypted.iv,     
            encrypted: true,      // Marcador para saber que está cifrado
            
            timestamp: serverTimestamp(),
            read: false, 
            reactions: {},
        };

        if (replyTo) newMessage.replyTo = replyTo;

        push(messagesRef, newMessage)
            .then(() => {
                messageInput.value = '';
                updateTypingStatus(false);
                isTypingActive = false; 
                clearTimeout(typingTimeout);
                typingTimeout = null;
                
                cancelReply();
                if (emojiPickerContainer) emojiPickerContainer.classList.remove('active'); 
            })
            .catch(error => console.error("Error al enviar:", error));
    });
}

if (cancelReplyButton) {
    cancelReplyButton.addEventListener('click', cancelReply);
}

function cancelReply() {
    replyTo = null;
    if (replyPreview) replyPreview.style.display = 'none';
}

function setupEmojiPicker() {
    if (!emojiPickerContainer || !emojiButton) return;
    if (customElements.get('emoji-picker')) { 
        const picker = document.createElement('emoji-picker');
        emojiPickerContainer.appendChild(picker);
        
        picker.addEventListener('emoji-click', event => {
            const emoji = event.detail.unicode;
            const start = messageInput.selectionStart;
            const end = messageInput.selectionEnd;
            const value = messageInput.value;
            messageInput.value = value.substring(0, start) + emoji + value.substring(end);
            messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
            messageInput.focus();
            messageInput.dispatchEvent(new Event('input')); 
        });

        emojiButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllMessageActions(); 
            emojiPickerContainer.classList.toggle('active');
        });
        
        document.addEventListener('click', (e) => {
            if (!emojiPickerContainer.contains(e.target) && !emojiButton.contains(e.target)) {
                emojiPickerContainer.classList.remove('active');
            }
        });
    }
}
setupEmojiPicker();

function updateTypingStatus(isTyping) {
    if (!activeChatUser) return;
    const userTypingRef = ref(database, `typing/${currentUser}`);
    if (isTyping) {
        set(userTypingRef, {
            username: currentUser,
            timestamp: Date.now(),
            chat: activeChatUser, 
        });
    } else {
        remove(userTypingRef);
    }
}

if (messageInput) {
    messageInput.addEventListener('input', () => {
        
        if (!isTypingActive) {
            updateTypingStatus(true);
            isTypingActive = true;
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            updateTypingStatus(false);
            isTypingActive = false; 
            typingTimeout = null;
        }, 2000); 
    });
}

onValue(typingRef, (snapshot) => {
    if (!typingIndicator || !activeChatUser) return;
    
    let isContactTyping = false;

    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            if (caseInsensitiveEquals(data.username, activeChatUser) && caseInsensitiveEquals(data.chat, currentUser)) { 
                const timeSinceTyping = Date.now() - data.timestamp;
                if (timeSinceTyping < 3000) { 
                    isContactTyping = true;
                }
            }
        });
    }
    
    if (isContactTyping) {
        const userName = activeChatUser; 
        const initial = userName.charAt(0).toUpperCase();
        typingIndicator.innerHTML = '';
        
        const avatar = document.createElement('div');
        avatar.className = 'typing-avatar';
        avatar.textContent = initial;
        
        const bubble = document.createElement('div');
        bubble.className = 'typing-bubble';
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'typing-dots-bubble';
        
        for (let i = 0; i < 3; i++) { 
            const dot = document.createElement('span');
            dot.className = 'typing-dot';
            dotsContainer.appendChild(dot);
        }
        
        bubble.appendChild(dotsContainer);
        typingIndicator.appendChild(avatar);
        typingIndicator.appendChild(bubble);
        
        typingIndicator.style.display = 'flex';
        
        if (contactStatusText) {
             contactStatusText.textContent = 'Escribiendo...';
             contactStatusText.className = 'contact-status-text online';
        }
        
        if (chatMessages) {
             chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
    } else {
        typingIndicator.style.display = 'none';
        updateChatHeaderStatus(); 
    }
});


if (clearAllButton) {
    clearAllButton.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres eliminar todos los mensajes? ¡Esta acción no se puede deshacer!')) {
            remove(messagesRef)
                .then(() => {
                    if (chatMessages) chatMessages.innerHTML = '';
                    allMessages = {};
                    chatMessageIds = [];
                    loadedMessageCount = 0;
                    
                    for (const user in CONTACTS_MAP) {
                        CONTACTS_MAP[user].timestamp = Date.now();
                        CONTACTS_MAP[user].unread = 0;
                    }
                    renderConversationsList(); 
                })
                .catch(error => console.error("Error al eliminar todos los mensajes:", error));
        }
    });
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0'); 
    return `${hours}:${minutes}`;
}

function updateSeenIndicator(messageElement, readAt, messageId) {
    if (!messageElement.classList.contains('sent')) return;
    
    let existingSeenIndicator = messageElement.querySelector('.seen-indicator');
    if (existingSeenIndicator) existingSeenIndicator.remove();
    
    if (seenIntervals[messageId]) {
        clearInterval(seenIntervals[messageId]);
        delete seenIntervals[messageId];
    }
    
    if (!readAt) {
        return;
    }
    
    let seenIndicator = document.createElement('div');
    seenIndicator.className = 'seen-indicator';
    seenIndicator.innerHTML = `<i class="fas fa-eye"></i> Visto ${getTimeAgo(readAt)}`;
    
    messageElement.appendChild(seenIndicator); 
    
    seenIntervals[messageId] = setInterval(() => {
        const currentElement = document.getElementById(messageId);
        if (currentElement) {
            const indicator = currentElement.querySelector('.seen-indicator');
            if (indicator) indicator.innerHTML = `<i class="fas fa-eye"></i> Visto ${getTimeAgo(readAt)}`;
        } else {
            clearInterval(seenIntervals[messageId]);
            delete seenIntervals[messageId];
        }
    }, 60000); 
}

function createMessageElement(messageId, message) {
    const isSentByCurrentUser = caseInsensitiveEquals(message.sender, currentUser);
    
    const messageWrapper = document.createElement('div');
    messageWrapper.id = messageId;
    messageWrapper.className = `message-wrapper ${isSentByCurrentUser ? 'sent' : 'received'}`; 
    
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';
    
    if (!isSentByCurrentUser) {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar contact-avatar';
        avatarDiv.textContent = message.sender.charAt(0).toUpperCase();
        messageContainer.appendChild(avatarDiv);
    }
    
    const messageContentDiv = document.createElement('div');
    messageContentDiv.className = 'message-content';

    if (!isSentByCurrentUser) {
        const senderName = document.createElement('p');
        senderName.className = 'message-sender';
        senderName.textContent = message.sender;
        messageContentDiv.appendChild(senderName);
    }
    
    if (message.replyTo) {
        const quoteDiv = document.createElement('div');
        quoteDiv.className = 'reply-original'; 
        const quoteUser = document.createElement('strong');
        quoteUser.textContent = message.replyTo.sender;
        const quoteText = document.createElement('p');
        quoteText.textContent = message.replyTo.text.length > 50 ? message.replyTo.text.substring(0, 50) + '...' : message.replyTo.text; 
        quoteDiv.appendChild(quoteUser);
        quoteDiv.appendChild(quoteText);
        messageContentDiv.appendChild(quoteDiv);
    }

    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.textContent = message.text;
    messageContentDiv.appendChild(textP);

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'message-time';
    
    let checkIconHtml = '';
    if (isSentByCurrentUser) {
        const readClass = message.read ? ' read' : ''; 
        checkIconHtml = `<i class="fas fa-check-double checkmark${readClass}"></i>`;
    }
    
    timestampSpan.innerHTML = formatTimestamp(message.timestamp) + (isSentByCurrentUser ? ` ${checkIconHtml}` : ''); 
    messageContentDiv.appendChild(timestampSpan);
    
    messageContainer.appendChild(messageContentDiv);
    
    const actionsDiv = createMessageActions(messageId, message);
    messageWrapper.appendChild(messageContainer); 
    messageWrapper.appendChild(actionsDiv); 
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions'; 
    addReactions(reactionsDiv, messageId, message.reactions);
    messageWrapper.appendChild(reactionsDiv); 
    
    if (isSentByCurrentUser && message.read && message.readAt) {
        updateSeenIndicator(messageWrapper, message.readAt, messageId);
    }
    
    return messageWrapper;
}

async function renderAndAppendMessage(messageId, message) { // ASÍNCRONA
    // 1. Procesar el mensaje (descifrar)
    const decryptedMessage = await processMessageForDisplay(message);
    
    // 2. Crear el elemento con el mensaje descifrado
    const messageWrapper = createMessageElement(messageId, decryptedMessage);
    
    // 3. Añadir al DOM
    if (chatMessages) chatMessages.appendChild(messageWrapper);
    
    // 4. Configurar acciones
    const actionsDiv = messageWrapper.querySelector('.message-actions');
    setupMessageActions(messageWrapper, actionsDiv); 
}

function deleteMessage(messageId) {
    if (confirm('¿Estás seguro de que quieres eliminar este mensaje? Esta acción es permanente.')) {
        remove(ref(database, `messages/${messageId}`))
            .catch(error => console.error("Error al eliminar el mensaje:", error));
    }
}

const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '🔥'];

function createMessageActions(messageId, message) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    const isSentByCurrentUser = caseInsensitiveEquals(message.sender, currentUser);

    const replyButton = document.createElement('button');
    replyButton.innerHTML = '<i class="fas fa-reply"></i>'; 
    replyButton.title = 'Responder';
    replyButton.className = 'action-button';
    replyButton.onclick = () => {
        replyTo = { id: messageId, sender: message.sender, text: message.text };
        const replyUser = document.getElementById('reply-user');
        const replyText = document.getElementById('reply-text');
        if (replyUser && replyText && replyPreview) {
            replyUser.textContent = message.sender;
            replyText.textContent = message.text.length > 50 ? message.text.substring(0, 50) + '...' : message.text; 
            replyPreview.style.display = 'flex';
        }
        if (messageInput) messageInput.focus();
        closeAllMessageActions(); 
    };
    actionsDiv.appendChild(replyButton);
    
    if (isSentByCurrentUser) {
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>'; 
        deleteButton.title = 'Eliminar';
        deleteButton.className = 'action-button';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            deleteMessage(messageId);
            closeAllMessageActions();
        };
        actionsDiv.appendChild(deleteButton);
    }
    
    const reactButton = document.createElement('button');
    reactButton.innerHTML = '<i class="far fa-smile-wink"></i>'; 
    reactButton.title = 'Reaccionar';
    reactButton.className = 'action-button';
    actionsDiv.appendChild(reactButton);
    
    const reactionSelector = document.createElement('div');
    reactionSelector.className = 'reaction-selector';
    reactionSelector.style.display = 'none'; 
    
    AVAILABLE_REACTIONS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.className = 'reaction-emoji';
        btn.onclick = (e) => {
            e.stopPropagation();
            toggleReaction(messageId, emoji);
            reactionSelector.style.display = 'none'; 
            closeAllMessageActions();
        };
        reactionSelector.appendChild(btn);
    });
    
    reactButton.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.reaction-selector').forEach(sel => {
            if (sel !== reactionSelector) sel.style.display = 'none';
        });
        reactionSelector.style.display = reactionSelector.style.display === 'none' ? 'flex' : 'none';
    };
    
    actionsDiv.appendChild(reactionSelector); 
    
    return actionsDiv;
}

function addReactions(container, messageId, reactions) {
    container.innerHTML = '';
    if (!reactions) return;
    const reactionCounts = {};
    
    const userReactedEmoji = reactions[currentUser];

    for (const userId in reactions) {
        const emoji = reactions[userId];
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
    }
    for (const emoji in reactionCounts) {
        const count = reactionCounts[emoji];
        const reactionSpan = document.createElement('span');
        const isUserReacted = userReactedEmoji === emoji; 
        
        reactionSpan.className = `reaction-badge ${isUserReacted ? 'user-reacted' : ''}`;
        
        reactionSpan.innerHTML = `${emoji} <span class="reaction-count">${count}</span>`;

        reactionSpan.onclick = (e) => {
            e.stopPropagation();
            toggleReaction(messageId, emoji);
        };
        container.appendChild(reactionSpan);
    }
}

function toggleReaction(messageId, emoji) {
    const reactionRef = ref(database, `messages/${messageId}/reactions/${currentUser}`);
    get(reactionRef).then(snapshot => {
        if (snapshot.exists() && snapshot.val() === emoji) {
            remove(reactionRef); 
        } else {
            set(reactionRef, emoji); 
        }
    });
}

function setupMessageActions(messageWrapper, actionsDiv) {
    
    const handleAction = (e) => {
        if (e.target.closest('.message-actions') || e.target.closest('.reaction-badge')) return; 
        
        closeAllMessageActions(messageWrapper); 
        
        messageWrapper.classList.toggle('active-actions');
        e.stopPropagation();
    };

    messageWrapper.addEventListener('click', handleAction);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.message-wrapper') && !e.target.closest('.message-actions') && !e.target.closest('.reaction-selector')) {
             closeAllMessageActions();
        }
    });

    if (chatMessages) chatMessages.addEventListener('scroll', closeAllMessageActions, { passive: true });
}

function closeAllMessageActions(excludeWrapper = null) {
    document.querySelectorAll('.message-wrapper').forEach(wrapper => {
        if (wrapper !== excludeWrapper) {
            wrapper.classList.remove('active-actions'); 
            const reactionSelector = wrapper.querySelector('.reaction-selector');
            if (reactionSelector) reactionSelector.style.display = 'none';
        }
    });
}


// ------------------------------------------------------------------
// --- 10. LÓGICA DE PAGINACIÓN DE MENSAJES (CARGA PEREZOSA) ---
// ------------------------------------------------------------------

function addLoadMoreIndicator() {
    let indicator = document.getElementById('load-more-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'load-more-indicator';
        indicator.className = 'load-more-indicator';
        if (chatMessages) {
            chatMessages.prepend(indicator);
            indicator.addEventListener('click', () => loadMessages(false));
        }
    }
    indicator.style.display = 'flex';
    indicator.innerHTML = '<i class="fas fa-chevron-up"></i> Cargar más mensajes';
    indicator.querySelector('i').classList.remove('fa-spin');
}

function removeLoadMoreIndicator() {
    const indicator = document.getElementById('load-more-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function showLoadingIndicator() {
    const indicator = document.getElementById('load-more-indicator');
    if (!indicator) return;
    indicator.style.display = 'flex';
    indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('load-more-indicator');
    if (!indicator) return;

    if (chatMessageIds.length <= loadedMessageCount) {
        indicator.style.display = 'none';
    } else {
        indicator.style.display = 'flex';
        indicator.innerHTML = '<i class="fas fa-chevron-up"></i> Cargar más mensajes';
        const spinner = indicator.querySelector('i.fa-spin');
        if (spinner) spinner.classList.remove('fa-spin');
    }
}


async function loadMessages(isInitialLoad = false) { 
    if (isLoadingMore || loadedMessageCount >= chatMessageIds.length) {
        removeLoadMoreIndicator();
        return;
    }
    
    isLoadingMore = true;
    showLoadingIndicator();
    
    const totalMessages = chatMessageIds.length;
    let batchIds = [];
    
    if (isInitialLoad) {
        const startIndex = Math.max(0, totalMessages - MESSAGES_PER_PAGE);
        batchIds = chatMessageIds.slice(startIndex);
        
        if(chatMessages) chatMessages.innerHTML = ''; 
        
        // Renderizar y añadir al final del chatMessages
        for (const id of batchIds) { 
            await renderAndAppendMessage(id, allMessages[id]);
        }
        
        loadedMessageCount = batchIds.length;
        
        if (totalMessages > loadedMessageCount) {
            addLoadMoreIndicator();
        } else {
             removeLoadMoreIndicator();
        }

        if (chatMessages && loadedMessageCount > 0) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 10); 
        }
        
    } else { 
        const oldScrollHeight = chatMessages.scrollHeight;
        
        const endIndex = totalMessages - loadedMessageCount; 
        const startIndex = Math.max(0, endIndex - MESSAGES_PER_PAGE); 
        
        batchIds = chatMessageIds.slice(startIndex, endIndex);
        
        if (startIndex > 0) {
             addLoadMoreIndicator(); 
        }
        
        const newElements = [];
        
        for (const id of batchIds) { 
            const msg = allMessages[id];
            // Descifrar antes de crear el elemento
            const decryptedMsg = await processMessageForDisplay(msg); 
            const messageElement = createMessageElement(id, decryptedMsg);
            newElements.push(messageElement);
            
            if (caseInsensitiveEquals(msg.sender, currentUser) && msg.read && msg.readAt) {
                updateSeenIndicator(messageElement, msg.readAt, id); 
            }
        }
        
        if (chatMessages) {
             const loadIndicator = document.getElementById('load-more-indicator');
             const insertionPoint = loadIndicator ? loadIndicator.nextSibling : chatMessages.firstChild;
             
             newElements.forEach(element => {
                 chatMessages.insertBefore(element, insertionPoint);
                 const actionsDiv = element.querySelector('.message-actions');
                 if (actionsDiv) setupMessageActions(element, actionsDiv); 
             });
        }

        loadedMessageCount += batchIds.length;
        
        if (chatMessages) {
            const newScrollHeight = chatMessages.scrollHeight;
            chatMessages.scrollTop = newScrollHeight - oldScrollHeight;
        }
    }
    
    hideLoadingIndicator();
    isLoadingMore = false;
}

function handleChatScroll() {
    if (isLoadingMore || loadedMessageCount >= chatMessageIds.length) return;

    if (chatMessages && chatMessages.scrollTop < 10) {
        setTimeout(() => {
            if (chatMessages.scrollTop < 10) {
                 loadMessages(false);
            }
        }, 100);
    }
}


// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    const username = sessionStorage.getItem('username');
    if (username) {
        const userAvatarMain = document.getElementById('user-avatar-main');
        if (userAvatarMain) {
            userAvatarMain.textContent = username.charAt(0).toUpperCase();
        }
    }
    renderConversationsList();
});