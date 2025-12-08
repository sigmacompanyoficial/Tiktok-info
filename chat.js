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


// --- FUNCIONES DE UTILIDAD ---

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


// --- LÓGICA DE ÚLTIMO MENSAJE Y NO LEÍDOS (NUEVAS FUNCIONES) ---

// Función para obtener el último mensaje y el conteo de no leídos para un contacto específico
function getLatestConversationData(partner) {
    let latestMessage = null;
    let latestTimestamp = 0;
    let unreadCount = 0;

    for (const id in allMessages) {
        const msg = allMessages[id];
        
        // 1. Es relevante si es entre el usuario actual y el partner
        const isRelevant = 
            (caseInsensitiveEquals(msg.sender, currentUser) && caseInsensitiveEquals(msg.receiver, partner)) ||
            (caseInsensitiveEquals(msg.sender, partner) && caseInsensitiveEquals(msg.receiver, currentUser));
            
        if (isRelevant) {
            const timestamp = msg.timestamp || 0;
            
            // 2. Encontrar el mensaje más reciente
            if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp;
                latestMessage = msg;
            }

            // 3. Contar no leídos (solo mensajes que el partner me envió a mí)
            if (caseInsensitiveEquals(msg.sender, partner) && 
                caseInsensitiveEquals(msg.receiver, currentUser) && 
                !msg.read) {
                unreadCount++;
            }
        }
    }
    
    return { latestMessage, unreadCount };
}


// --- 4. GESTIÓN DE AUTENTICACIÓN Y NAVEGACIÓN ---
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
    
    // Escuchar cambios en el estado de los usuarios (y poblar la lista de contactos)
    onValue(usersRef, (snapshot) => {
        USERS_STATUS = {};
        const tempUsersMap = {}; 
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const username = childSnapshot.key;
                const status = childSnapshot.val();
                USERS_STATUS[username] = status;
                
                if (!caseInsensitiveEquals(username, currentUser)) {
                    
                    // OBTENER LA INFORMACIÓN MÁS RECIENTE DE LA CONVERSACIÓN
                    const { latestMessage, unreadCount } = getLatestConversationData(username);

                    tempUsersMap[username] = {
                        username: username,
                        lastMessage: latestMessage ? latestMessage.text : null,
                        timestamp: latestMessage ? latestMessage.timestamp : status.lastSeen || Date.now(),
                        unread: unreadCount,
                    };
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
// --- 5. LÓGICA DE LA LISTA DE CONVERSACIONES ("ÚLTIMA HORA") ---
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

        // Si no hay mensaje, pero el contacto existe (por /users), lo mostramos.
        if (!contact.lastMessage) {
             const latestData = getLatestConversationData(contact.username);
             contact.lastMessage = latestData.latestMessage ? latestData.latestMessage.text : 'Nueva conversación';
             contact.timestamp = latestData.latestMessage ? latestData.latestMessage.timestamp : contact.timestamp;
             contact.unread = latestData.unreadCount;
        }

        const item = document.createElement('div');
        const isActive = activeChatUser && caseInsensitiveEquals(contact.username, activeChatUser);
        item.className = `conversation-item ${isActive ? 'active' : ''}`;
        item.dataset.targetUser = contact.username;
        
        const status = USERS_STATUS[contact.username];
        const isOnline = status && status.isOnline;
        
        item.innerHTML = `
            <div class="contact-avatar ${isOnline ? 'online' : ''}"></div> <div class="chat-details">
                <span class="chat-name">${contact.username}</span>
                <p class="last-message">${contact.lastMessage ? (contact.lastMessage.substring(0, 30) + (contact.lastMessage.length > 30 ? '...' : '')) : 'Nueva conversación'}</p>
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

    if (chatMessages) chatMessages.innerHTML = '';
    
    let renderedCount = 0;
    for (const id in allMessages) {
        const msg = allMessages[id];
        
        const isRelevant = 
            (caseInsensitiveEquals(msg.sender, currentUser) && caseInsensitiveEquals(msg.receiver, activeChatUser)) ||
            (caseInsensitiveEquals(msg.sender, activeChatUser) && caseInsensitiveEquals(msg.receiver, currentUser));
            
        if (isRelevant) {
            renderAndAppendMessage(id, msg);
            renderedCount++;
        }
    }
    
    if (chatMessages && renderedCount > 0) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // 1. Resetear contador de no leídos y re-renderizar la lista
    if (CONTACTS_MAP[username]) {
         CONTACTS_MAP[username].unread = 0;
         renderConversationsList();
    }
    
    // 2. Actualizar el estado del contacto en el encabezado
    updateChatHeaderStatus();
    
    // 3. Marcar como leído los mensajes del chat activo
    for (const id in allMessages) {
        const msg = allMessages[id];
        if (caseInsensitiveEquals(msg.receiver, currentUser) && 
            caseInsensitiveEquals(msg.sender, activeChatUser) && 
            !msg.read) {
            
            set(ref(database, `messages/${id}/read`), true);
            set(ref(database, `messages/${id}/readAt`), Date.now());
        }
    }
}

// --------------------------------------------------------------------------
// --- 6. GESTIÓN DE MENSAJES EN TIEMPO REAL (onChildAdded, onChildChanged) ---
// --------------------------------------------------------------------------

onChildAdded(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const message = snapshot.val();
    
    if (!message.receiver) {
        message.receiver = caseInsensitiveEquals(message.sender, currentUser) ? activeChatUser : currentUser; 
    }
    
    allMessages[messageId] = message; 

    // 1. DETERMINAR CON QUIÉN ES LA CONVERSACIÓN
    const interactionPartner = caseInsensitiveEquals(message.sender, currentUser) ? message.receiver : message.sender;

    if(!interactionPartner || caseInsensitiveEquals(interactionPartner, currentUser)) return;

    // 2. ACTUALIZAR LISTA DE CONTACTOS DINÁMICAMENTE (usando CONTACTS_MAP)
    let contact = CONTACTS_MAP[interactionPartner];
    
    if (!contact) {
        // Si el contacto no está en el mapa, lo agregamos (la lógica de usersRef debería haberlo añadido)
        const status = USERS_STATUS[interactionPartner] || {};
        contact = {
            username: interactionPartner,
            lastMessage: message.text,
            timestamp: message.timestamp || Date.now(),
            unread: caseInsensitiveEquals(message.sender, currentUser) ? 0 : 1, 
            lastSeen: status.lastSeen || null,
            isOnline: status.isOnline || false
        };
        CONTACTS_MAP[interactionPartner] = contact;
    } else {
        // Actualizamos con el mensaje más reciente
        contact.lastMessage = message.text;
        contact.timestamp = message.timestamp || Date.now();
        
        // Incrementar contador si no lo envié yo y no estoy en ese chat ahora mismo
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
            if (document.getElementById(messageId)) return;
            
            const isScrolledToBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 50;
            renderAndAppendMessage(messageId, message);

            // Marcar como visto si lo recibí yo (y el chat está activo)
            if (!caseInsensitiveEquals(message.sender, currentUser) && !message.read) {
                 setTimeout(() => {
                     if (caseInsensitiveEquals(interactionPartner, activeChatUser)) {
                         set(ref(database, `messages/${messageId}/read`), true);
                         set(ref(database, `messages/${messageId}/readAt`), Date.now());
                     }
                 }, 500); 
            }
            
            if (isScrolledToBottom && chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
    }
});

onChildChanged(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const messageData = snapshot.val();
    allMessages[messageId] = messageData; 
    
    const interactionPartner = caseInsensitiveEquals(messageData.sender, currentUser) ? messageData.receiver : messageData.sender;

    // Lógica para actualizar mensaje en vivo (ediciones, reacciones, visto)
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
                 
                 const newMessageWrapper = createMessageElement(messageId, messageData);
                 if (nextSibling) {
                     parent.insertBefore(newMessageWrapper, nextSibling);
                 } else {
                     parent.appendChild(newMessageWrapper);
                 }
                 const actionsDiv = newMessageWrapper.querySelector('.message-actions');
                 if (actionsDiv) setupMessageActions(newMessageWrapper, actionsDiv); // Usar nueva función
                 
                 // Re-aplicar el indicador de visto si es enviado y está marcado como leído
                 if (caseInsensitiveEquals(messageData.sender, currentUser) && messageData.read && messageData.readAt) {
                    updateSeenIndicator(newMessageWrapper, messageData.readAt, messageId);
                 }
            }
        }
    }
    
    // LÓGICA DE CORRECCIÓN: Recalcular el contador de no leídos en el contacto afectado
    if (interactionPartner && CONTACTS_MAP[interactionPartner]) {
         const contact = CONTACTS_MAP[interactionPartner];
         
         const { unreadCount } = getLatestConversationData(interactionPartner);
         
         if (contact.unread !== unreadCount) {
             contact.unread = unreadCount;
             renderConversationsList(); // Re-renderizar la lista si el conteo cambia
         }
    }
});

onChildRemoved(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    delete allMessages[messageId]; 
    if (seenIntervals[messageId]) {
        clearInterval(seenIntervals[messageId]);
        delete seenIntervals[messageId];
    }
    const messageElement = document.getElementById(messageId);
    if (messageElement) messageElement.remove();
    
    // Opcional: Re-renderizar la lista para asegurar que el 'lastMessage' se actualice si el último fue eliminado
    renderConversationsList();
});

// --------------------------------------------------------------------------
// --- 7. ENVÍO DE MENSAJES Y FUNCIONES AUXILIARES ---
// --------------------------------------------------------------------------

if (messageForm && messageInput) {
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        
        if (messageText === '') return; 
        if (!activeChatUser) {
            alert("Selecciona un chat primero");
            return;
        }

        const newMessage = {
            sender: currentUser,
            receiver: activeChatUser, 
            text: messageText,
            timestamp: serverTimestamp(),
            read: false, 
            reactions: {},
        };

        if (replyTo) newMessage.replyTo = replyTo;

        push(messagesRef, newMessage)
            .then(() => {
                messageInput.value = '';
                updateTypingStatus(false);
                clearTimeout(typingTimeout);
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
        clearTimeout(typingTimeout);
        updateTypingStatus(true);
        typingTimeout = setTimeout(() => updateTypingStatus(false), 2000); 
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
                    for (const user in CONTACTS_MAP) {
                        CONTACTS_MAP[user].lastMessage = 'Chat reiniciado';
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
    
    // Si ya tiene un indicador (ej. de una actualización previa), lo eliminamos para re-crearlo
    let existingSeenIndicator = messageElement.querySelector('.seen-indicator');
    if (existingSeenIndicator) existingSeenIndicator.remove();
    
    if (seenIntervals[messageId]) {
        clearInterval(seenIntervals[messageId]);
        delete seenIntervals[messageId];
    }
    
    if (!readAt) {
        return;
    }
    
    // Crear el nuevo indicador
    let seenIndicator = document.createElement('div');
    seenIndicator.className = 'seen-indicator';
    seenIndicator.innerHTML = `<i class="fas fa-eye"></i> Visto ${getTimeAgo(readAt)}`;
    
    // Asegurarse de añadirlo al message-wrapper (que ahora es el contenedor principal con flex-direction: column)
    messageElement.appendChild(seenIndicator); 
    
    // Configurar el intervalo para actualizar el 'hace X tiempo'
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
    
    // NUEVO: Contenedor para el avatar y la burbuja de mensaje (para alinear)
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
        // Usar el texto de la respuesta guardado en el mensaje
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
    messageWrapper.appendChild(messageContainer); // Añadir el contenedor principal
    messageWrapper.appendChild(actionsDiv); // Las acciones (ocultas por defecto)
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions'; 
    addReactions(reactionsDiv, messageId, message.reactions);
    messageWrapper.appendChild(reactionsDiv); // Las reacciones
    
    // El indicador de visto se añade fuera del message-container, justo al final del message-wrapper (columna)
    if (isSentByCurrentUser && message.read && message.readAt) {
        updateSeenIndicator(messageWrapper, message.readAt, messageId);
    }
    
    return messageWrapper;
}

function renderAndAppendMessage(messageId, message) {
    const messageWrapper = createMessageElement(messageId, message);
    if (chatMessages) chatMessages.appendChild(messageWrapper);
    const actionsDiv = messageWrapper.querySelector('.message-actions');
    // Usar la nueva función que maneja solo el click
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
            // Corregir la referencia a message.replyTo en el preview, debe ser message.text
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
    const userReacted = reactions[currentUser];

    for (const userId in reactions) {
        const emoji = reactions[userId];
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
    }
    for (const emoji in reactionCounts) {
        const count = reactionCounts[emoji];
        const reactionSpan = document.createElement('span');
        reactionSpan.className = `reaction-badge ${userReacted === emoji ? 'user-reacted' : ''}`;
        
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


// LÓGICA DE INTERACCIÓN DE MENSAJES (AHORA SOLO USA CLICK/TAP)
function setupMessageActions(messageWrapper, actionsDiv) {
    
    // 1. Desktop Hover (activar al pasar el ratón) - ELIMINADO

    // 2. Click/Tap (Móvil y PC)
    const handleAction = (e) => {
        // Permitir que el clic en los botones de acción o reacciones funcione
        if (e.target.closest('.message-actions') || e.target.closest('.reaction-badge')) return; 
        
        // Cierra otras acciones abiertas
        closeAllMessageActions(messageWrapper); 
        
        // El clic/tap alterna el estado
        messageWrapper.classList.toggle('active-actions');
        e.stopPropagation();
    };

    messageWrapper.addEventListener('click', handleAction);
    
    // Listener global para cerrar acciones si se hace clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.message-wrapper') && !e.target.closest('.message-actions') && !e.target.closest('.reaction-selector')) {
             closeAllMessageActions();
        }
    });

    // Cierra acciones al hacer scroll en el área de chat
    if (chatMessages) chatMessages.addEventListener('scroll', closeAllMessageActions, { passive: true });
}

function closeAllMessageActions(excludeWrapper = null) {
    document.querySelectorAll('.message-wrapper').forEach(wrapper => {
        if (wrapper !== excludeWrapper) {
            // Renombrado de active-touch a active-actions
            wrapper.classList.remove('active-actions'); 
            const reactionSelector = wrapper.querySelector('.reaction-selector');
            if (reactionSelector) reactionSelector.style.display = 'none';
        }
    });
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