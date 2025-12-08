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
    onDisconnect, // Agregado onDisconnect para estado de presencia
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
const usersRef = ref(database, 'users'); // Referencia para el estado de usuario (online/lastSeen)


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
const contactStatusText = document.getElementById('contact-status-text'); // Para el estado del chat
const chatContactAvatar = document.getElementById('chat-contact-avatar'); // Para el avatar del chat


// --- 3. VARIABLES DE ESTADO ---
let currentUser = sessionStorage.getItem('username');
let replyTo = null;
let typingTimeout = null;
let seenIntervals = {};
let allMessages = {}; 
let activeChatUser = null; 
let USERS_STATUS = {}; // Estado en línea/última vez visto de todos los usuarios

// Lista de contactos (Se llenará dinámicamente con los mensajes entrantes)
const CONTACTS_LIST = [
    { username: 'Soporte TikTok', lastMessage: 'Bienvenido al soporte.', timestamp: Date.now(), unread: 0 },
];


// --- FUNCIONES DE UTILIDAD ---

const caseInsensitiveEquals = (str1, str2) => {
    if (!str1 || !str2) return str1 === str2;
    return String(str1).toLowerCase() === String(str2).toLowerCase();
};

// Función para mostrar el tiempo transcurrido (para "Última vez visto")
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


// --- 4. GESTIÓN DE AUTENTICACIÓN Y NAVEGACIÓN ---
if (!currentUser) {
    window.location.href = 'nnn.html'; // Redirección a nnn.html
} else {
    if (usernameDisplay) usernameDisplay.textContent = currentUser;
    setupUserPresence(); // Inicializar el estado de presencia del usuario actual
}

// Lógica de Presencia (Estado Online/Offline)
function setupUserPresence() {
    const userStatusRef = ref(database, `users/${currentUser}`);

    // Establecer el estado inicial a 'online' y última vez visto
    set(userStatusRef, {
        isOnline: true,
        lastSeen: serverTimestamp() 
    });

    // Cuando se desconecte (cierre la pestaña, internet, etc.), actualizar el estado
    onDisconnect(userStatusRef).set({
        isOnline: false,
        lastSeen: serverTimestamp() 
    });
    
    // Escuchar cambios en el estado de los usuarios
    onValue(usersRef, (snapshot) => {
        USERS_STATUS = {};
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const username = childSnapshot.key;
                USERS_STATUS[username] = childSnapshot.val();
            });
        }
        renderConversationsList();
        updateChatHeaderStatus(); // Actualizar el estado del chat activo
    });
}

// Función para actualizar el estado en el encabezado del chat
function updateChatHeaderStatus() {
    if (!activeChatUser || !contactStatusText) return;
    
    // Si el indicador de escribiendo está visible, salimos (ya está en "Escribiendo...")
    if (typingIndicator && typingIndicator.style.display !== 'none' && contactStatusText.textContent === 'Escribiendo...') {
        return; 
    }

    const status = USERS_STATUS[activeChatUser];

    if (status && status.isOnline) {
        contactStatusText.textContent = 'En línea';
        contactStatusText.className = 'contact-status-text online';
    } else if (status && status.lastSeen) {
        // Muestra la hora de la última conexión
        contactStatusText.textContent = `Última vez ${getTimeAgo(status.lastSeen)}`; 
        contactStatusText.className = 'contact-status-text offline';
    } else {
        contactStatusText.textContent = 'Desconectado';
        contactStatusText.className = 'contact-status-text offline';
    }
}


if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        // Marcar como offline al cerrar sesión
        set(ref(database, `users/${currentUser}`), { isOnline: false, lastSeen: Date.now() })
            .then(() => {
                sessionStorage.removeItem('username');
                window.location.href = 'nnn.html'; // Redirección a nnn.html
            });
    });
}

if (homeButton) {
    homeButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
}

// Lógica del botón de retroceso (Móvil)
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
            if (emojiPickerContainer) emojiPickerContainer.classList.remove('active'); // Usa classList
        };
        const contactInfo = chatHeader.querySelector('.contact-info');
        if (contactInfo) {
            contactInfo.prepend(backButton);
        } else {
            chatHeader.prepend(backButton); 
        }
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
    
    // Ordenar por el mensaje más reciente
    const sortedContacts = [...CONTACTS_LIST].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedContacts.forEach(contact => {
        // No mostrarse a uno mismo en la lista de chats
        if (caseInsensitiveEquals(contact.username, currentUser)) return;

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
    activeChatUser = username;
    if (currentChatName) currentChatName.textContent = username;
    if (chatContactAvatar) chatContactAvatar.textContent = username.charAt(0).toUpperCase();

    // 1. Resaltar el chat activo
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (caseInsensitiveEquals(item.dataset.targetUser, username)) {
            item.classList.add('active');
        }
    });

    // 2. VACIAR y cargar mensajes
    if (chatMessages) chatMessages.innerHTML = '';
    
    let renderedCount = 0;
    for (const id in allMessages) {
        const msg = allMessages[id];
        
        // ** FILTRADO ESTRICTO **
        // Solo mostrar mensajes entre YO y el USUARIO ACTIVO
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
    
    // 3. Resetear contador de no leídos
    const contactIndex = CONTACTS_LIST.findIndex(c => caseInsensitiveEquals(c.username, username));
    if (contactIndex !== -1) {
         CONTACTS_LIST[contactIndex].unread = 0;
         renderConversationsList();
    }
    
    // 4. Actualizar el estado del contacto en el encabezado
    updateChatHeaderStatus();
}

// --------------------------------------------------------------------------
// --- 6. GESTIÓN DE MENSAJES EN TIEMPO REAL (onChildAdded) ---
// --------------------------------------------------------------------------

onChildAdded(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const message = snapshot.val();
    
    // Protección: Si no tiene receptor, asumimos que es para el currentUser si no lo envió él
    if (!message.receiver) {
        message.receiver = caseInsensitiveEquals(message.sender, currentUser) ? activeChatUser : currentUser; 
    }
    
    allMessages[messageId] = message; 

    // 1. DETERMINAR CON QUIÉN ES LA CONVERSACIÓN
    // Si yo lo envié, el contacto es el receiver. Si me lo enviaron, el contacto es el sender.
    const interactionPartner = caseInsensitiveEquals(message.sender, currentUser) ? message.receiver : message.sender;

    // Ignorar mensajes corruptos sin participantes
    if(!interactionPartner) return;

    // 2. ACTUALIZAR LISTA DE CONTACTOS DINÁMICAMENTE
    let contactIndex = CONTACTS_LIST.findIndex(c => caseInsensitiveEquals(c.username, interactionPartner));
    
    if (contactIndex === -1) {
        // ¡NUEVO CONTACTO DETECTADO! Lo agregamos a la lista.
        CONTACTS_LIST.push({
            username: interactionPartner,
            lastMessage: message.text,
            timestamp: message.timestamp || Date.now(),
            unread: caseInsensitiveEquals(message.sender, currentUser) ? 0 : 1
        });
    } else {
        // Actualizamos contacto existente
        CONTACTS_LIST[contactIndex].lastMessage = message.text;
        CONTACTS_LIST[contactIndex].timestamp = message.timestamp || Date.now();
        
        // Incrementar contador si no lo envié yo y no estoy en ese chat ahora mismo
        if (!caseInsensitiveEquals(message.sender, currentUser) && 
            !caseInsensitiveEquals(interactionPartner, activeChatUser)) {
             CONTACTS_LIST[contactIndex].unread = (CONTACTS_LIST[contactIndex].unread || 0) + 1;
        }
    }
    
    // Renderizamos la lista para que aparezca el nuevo chat o el nuevo mensaje
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

            // Marcar como visto si lo recibí yo
            if (!caseInsensitiveEquals(message.sender, currentUser) && !message.read) {
                 setTimeout(() => {
                     // El visto solo se marca si el chat está activo
                     if (caseInsensitiveEquals(interactionPartner, activeChatUser)) {
                         set(ref(database, `messages/${messageId}/read`), true);
                         set(ref(database, `messages/${messageId}/readAt`), Date.now());
                     }
                 }, 1000); 
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
                 oldMessageElement.remove();
                 const newMessageWrapper = createMessageElement(messageId, messageData);
                 if (nextSibling) {
                     parent.insertBefore(newMessageWrapper, nextSibling);
                 } else {
                     parent.appendChild(newMessageWrapper);
                 }
                 const actionsDiv = newMessageWrapper.querySelector('.message-actions');
                 if (actionsDiv) setupTouchAction(newMessageWrapper, actionsDiv);
            }
        }
    }
});

onChildRemoved(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    delete allMessages[messageId]; 
    const messageElement = document.getElementById(messageId);
    if (messageElement) messageElement.remove();
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
                if (emojiPickerContainer) emojiPickerContainer.classList.remove('active'); // Usa classList
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
        // Usaremos la clase CSS para controlar la visibilidad y animación
        // emojiPickerContainer.style.display = 'none'; // Ya no es necesario
        
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
            if (window.innerWidth > 900) {
                 // Esta lógica es más compleja con la clase, mejor dejarla en el CSS media query
            } 
            // Usa la clase 'active' para controlar la visibilidad (con transición)
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
            chat: activeChatUser, // Indica A QUIÉN está escribiendo
        });
    } else {
        // Usar la función onDisconnect para borrar el estado si la conexión se pierde
        // Si no usamos onDisconnect aquí, el estado podría quedar 'true' permanentemente
        remove(userTypingRef);
    }
}

if (messageInput) {
    messageInput.addEventListener('input', () => {
        clearTimeout(typingTimeout);
        updateTypingStatus(true);
        // Si no hay actividad después de 2 segundos, se considera que dejó de escribir
        typingTimeout = setTimeout(() => updateTypingStatus(false), 2000); 
    });
    messageInput.addEventListener('blur', () => {
        // Cuando el input pierde el foco, detener el estado de escritura
        clearTimeout(typingTimeout);
        updateTypingStatus(false);
    });
}

// Lógica para mostrar la animación de "escribiendo..."
onValue(typingRef, (snapshot) => {
    if (!typingIndicator || !activeChatUser) return;
    
    let isContactTyping = false;

    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            // Comprueba si el contacto activo está escribiéndome a MÍ
            if (caseInsensitiveEquals(data.username, activeChatUser) && caseInsensitiveEquals(data.chat, currentUser)) { 
                const timeSinceTyping = Date.now() - data.timestamp;
                if (timeSinceTyping < 3000) { // Considerar 'escribiendo' por 3 segundos
                    isContactTyping = true;
                }
            }
        });
    }
    
    if (isContactTyping) {
        // 2. ANIMACIÓN DE 3 PUNTOS
        const userName = activeChatUser; 
        const initial = userName.charAt(0).toUpperCase();
        typingIndicator.innerHTML = '';
        
        // 1. Avatar
        const avatar = document.createElement('div');
        avatar.className = 'typing-avatar';
        avatar.textContent = initial;
        
        // 2. Burbuja y Puntos
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
        
        // Actualizar estado del encabezado a "Escribiendo..."
        if (contactStatusText) {
             contactStatusText.textContent = 'Escribiendo...';
             contactStatusText.className = 'contact-status-text online';
        }
        
    } else {
        typingIndicator.style.display = 'none';
        // Recalcular el estado (Online/Última vez)
        updateChatHeaderStatus(); 
    }
});


if (clearAllButton) {
    clearAllButton.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres eliminar todos los mensajes?')) {
            remove(messagesRef)
                .then(() => {
                    if (chatMessages) chatMessages.innerHTML = '';
                    allMessages = {};
                    // Resetear lista dejando solo el soporte
                    CONTACTS_LIST.length = 0;
                    CONTACTS_LIST.push({ username: 'Soporte TikTok', lastMessage: 'Chat reiniciado', timestamp: Date.now(), unread: 0 });
                    renderConversationsList(); 
                });
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

// Función para actualizar el indicador de "Visto"
function updateSeenIndicator(messageElement, readAt, messageId) {
    if (!readAt) {
        const existingSeenIndicator = messageElement.querySelector('.seen-indicator');
        if (existingSeenIndicator) existingSeenIndicator.remove();
        return;
    }
    
    let seenIndicator = messageElement.querySelector('.seen-indicator');
    if (!seenIndicator) {
        seenIndicator = document.createElement('div');
        seenIndicator.className = 'seen-indicator';
        messageElement.appendChild(seenIndicator);
        
        // Limpiar intervalo anterior si existe
        if (seenIntervals[messageId]) clearInterval(seenIntervals[messageId]);
        
        // Crear un intervalo que se actualice cada minuto
        seenIntervals[messageId] = setInterval(() => {
            const currentElement = document.getElementById(messageId);
            if (currentElement) {
                const indicator = currentElement.querySelector('.seen-indicator');
                if (indicator) indicator.innerHTML = `<i class="fas fa-eye"></i> Visto ${getTimeAgo(readAt)}`;
            } else {
                clearInterval(seenIntervals[messageId]);
                delete seenIntervals[messageId];
            }
        }, 60000); // Actualiza cada 1 minuto (60000 ms)
    }
    seenIndicator.innerHTML = `<i class="fas fa-eye"></i> Visto ${getTimeAgo(readAt)}`;
}

function createMessageElement(messageId, message) {
    const isSentByCurrentUser = caseInsensitiveEquals(message.sender, currentUser);
    
    const messageWrapper = document.createElement('div');
    messageWrapper.id = messageId;
    messageWrapper.className = `message-wrapper ${isSentByCurrentUser ? 'sent' : 'received'}`; // Clase actualizada a message-wrapper
    
    // Avatar (solo para mensajes recibidos)
    if (!isSentByCurrentUser) {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar contact-avatar';
        avatarDiv.textContent = message.sender.charAt(0).toUpperCase();
        messageWrapper.appendChild(avatarDiv);
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
        quoteDiv.className = 'reply-original'; // Clase actualizada para el quote
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
        // Icono de doble check
        checkIconHtml = `<i class="fas fa-check-double checkmark${readClass}"></i>`;
    }
    
    timestampSpan.innerHTML = formatTimestamp(message.timestamp) + (isSentByCurrentUser ? ` ${checkIconHtml}` : ''); 
    messageContentDiv.appendChild(timestampSpan);
    
    messageWrapper.appendChild(messageContentDiv);
    
    const actionsDiv = createMessageActions(messageId, message);
    messageWrapper.appendChild(actionsDiv);
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions'; // Clase actualizada para las reacciones
    addReactions(reactionsDiv, messageId, message.reactions);
    messageWrapper.appendChild(reactionsDiv);

    // Indicador de visto solo para mensajes enviados
    if (isSentByCurrentUser && message.read && message.readAt) {
        updateSeenIndicator(messageWrapper, message.readAt, messageId);
    }
    
    return messageWrapper;
}

function renderAndAppendMessage(messageId, message) {
    const messageWrapper = createMessageElement(messageId, message);
    if (chatMessages) chatMessages.appendChild(messageWrapper);
    const actionsDiv = messageWrapper.querySelector('.message-actions');
    setupTouchAction(messageWrapper, actionsDiv);
}

const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '🔥'];

function createMessageActions(messageId, message) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

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
    
    document.addEventListener('click', (e) => {
        if (!actionsDiv.contains(e.target) && reactionSelector.style.display === 'flex') {
            reactionSelector.style.display = 'none';
        }
    });

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

function setupTouchAction(messageWrapper, actionsDiv) {
    let touchExecuted = false; 

    const handleAction = (e) => {
        if (e.target.closest('.message-actions')) return;
        closeAllMessageActions(actionsDiv);
        actionsDiv.classList.toggle('active-touch');
        e.stopPropagation(); 
    };

    messageWrapper.addEventListener('touchstart', (e) => {
        touchExecuted = true;
        setTimeout(() => handleAction(e), 100); 
    }, { passive: true });
    
    messageWrapper.addEventListener('click', (e) => {
        if (touchExecuted) {
            touchExecuted = false; 
            return;
        }
        handleAction(e);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.message-wrapper') && !e.target.closest('.message-actions')) {
             closeAllMessageActions();
        }
    });

    if (chatMessages) chatMessages.addEventListener('scroll', closeAllMessageActions, { passive: true });
}

function closeAllMessageActions(excludeActionsDiv = null) {
    document.querySelectorAll('.message-actions').forEach(actionsDiv => {
        if (actionsDiv !== excludeActionsDiv) {
            actionsDiv.classList.remove('active-touch');
            const reactionSelector = actionsDiv.querySelector('.reaction-selector');
            if (reactionSelector) reactionSelector.style.display = 'none';
        }
    });
}

// INICIALIZACIÓN
renderConversationsList();