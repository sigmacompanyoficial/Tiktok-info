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

// --- LÓGICA DE NOTIFICACIÓN TOAST (NUEVOS ELEMENTOS) ---
const notificationToast = document.getElementById('notification-toast');
const toastSenderName = document.getElementById('toast-sender-name');
const toastMessageContent = document.getElementById('toast-message-content');
const toastAvatarInitial = document.getElementById('toast-avatar-initial');
let notificationTimeout = null; 


// --- 3. VARIABLES DE ESTADO ---
let currentUser = sessionStorage.getItem('username');
let replyTo = null;
let typingTimeout = null;
let seenIntervals = {};
let allMessages = {}; 
let activeChatUser = null; // ID del usuario del chat actualmente abierto
let USERS_STATUS = {}; 
let CONTACTS_MAP = {}; 
let isTypingActive = false; 
let timeUpdateInterval = null; // **NUEVA VARIABLE: Intervalo para actualizar el estado de conexión**

// NUEVAS VARIABLES PARA PAGINACIÓN Y OPTIMIZACIÓN
const MESSAGES_PER_PAGE = 15; // Lote de 15 mensajes
let chatMessageIds = []; // IDs de mensajes relevantes para el chat activo, ordenados por tiempo
let loadedMessageCount = 0; // Número de mensajes cargados actualmente
let isLoadingMore = false; // Bandera para evitar múltiples cargas


// ==========================================================
// --- LÓGICA DE NOTIFICACIÓN TOAST (SHOW MODAL) ---
// ==========================================================

/**
 * Muestra el modal de notificación con el mensaje durante 6 segundos.
 * @param {string} senderName - Nombre de la persona que envía el mensaje.
 * @param {string} messageText - Contenido del mensaje.
 * @param {string} username - Nombre de usuario del remitente (para ir al chat al hacer clic).
 */
function showNotification(senderName, messageText, username) {
    // 1. Limpiar cualquier temporizador existente
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        notificationTimeout = null;
    }

    // 2. Rellenar el contenido
    toastSenderName.textContent = senderName;
    toastMessageContent.textContent = messageText;
    toastAvatarInitial.textContent = senderName.charAt(0).toUpperCase();

    // 3. Mostrar la notificación con transición
    if (notificationToast) {
        notificationToast.style.display = 'flex';
        setTimeout(() => {
            notificationToast.classList.add('show');
        }, 10); 
    }


    // 4. Configurar el cierre automático después de 6 segundos
    notificationTimeout = setTimeout(() => {
        if (notificationToast) notificationToast.classList.remove('show');
        // Usar un pequeño retraso para la transición de salida
        setTimeout(() => {
            if (notificationToast) notificationToast.style.display = 'none';
        }, 400); 
        notificationTimeout = null;
    }, 6000); // 6000 ms = 6 segundos

    // 5. Configurar el clic en la notificación para ir al chat
    if (notificationToast) {
        notificationToast.onclick = () => {
            // Llama a la función existente para cambiar el chat y oculta el panel en móvil
            setActiveChat(username); 
            if (window.innerWidth <= 900 && chatRoomPanel) {
                chatRoomPanel.classList.add('active');
            }
            
            notificationToast.classList.remove('show');
            if (notificationTimeout) {
                clearTimeout(notificationTimeout);
                notificationTimeout = null;
            }
        };
    }
}
// ==========================================================
// --- FIN LÓGICA DE NOTIFICACIÓN TOAST ---
// ==========================================================


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
    
    // CORRECCIÓN DE FORMATO DE FECHA PARA 'HACE MUCHO'
    if (days >= 7) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); 
    }
    
    if (seconds < 60) return 'justo ahora';
    if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}


// Función para obtener el último mensaje y el conteo de no leídos para un contacto específico
function getLatestConversationData(partner) {
    let latestMessage = null;
    let latestTimestamp = 0;
    let unreadCount = 0;

    for (const id in allMessages) {
        const msg = allMessages[id];
        
        // La condición de relevancia asegura que solo se consideren mensajes directos
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
    
    // Devolvemos el texto solo si es necesario, pero en este caso solo necesitamos timestamp y unreadCount para la lista.
    return { latestMessage, latestTimestamp, unreadCount };
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

    // Configurar el estado de conexión del usuario actual
    set(userStatusRef, {
        isOnline: true,
        lastSeen: serverTimestamp() 
    });

    // Configurar lo que sucede al desconectarse
    onDisconnect(userStatusRef).set({
        isOnline: false,
        lastSeen: serverTimestamp() 
    });
    
    // Escuchar cambios en el estado de TODOS los usuarios (y poblar la lista de contactos)
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
                    
                    // Solo incluir en la lista si hay un mensaje o si es un usuario conocido (que se haya conectado alguna vez)
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
        // Llamada inicial/de cambio para actualizar el estado del chat activo
        updateChatHeaderStatus(); 
    });
}

/**
 * Inicia el intervalo para actualizar periódicamente la hora de 'Última vez' del contacto activo.
 */
function startContactStatusInterval() {
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
    }
    
    // Actualizar cada minuto para reflejar la hora con precisión 'hace X minutos'
    timeUpdateInterval = setInterval(updateChatHeaderStatus, 60000); 
    // Llamada inicial para garantizar la actualización inmediata
    updateChatHeaderStatus();
}


/**
 * Actualiza el texto de estado en el encabezado del chat (En línea / Última vez / Escribiendo).
 */
function updateChatHeaderStatus() {
    if (!activeChatUser || !contactStatusText) return;
    
    // Prioridad 1: Indicador de 'Escribiendo...' (solo si ya estaba activo)
    if (typingIndicator && typingIndicator.style.display !== 'none' && contactStatusText.textContent === 'Escribiendo...') {
        return; 
    }

    const status = USERS_STATUS[activeChatUser];

    if (status && status.isOnline) {
        contactStatusText.textContent = 'En línea';
        contactStatusText.className = 'contact-status-text online';
    } else if (status && status.lastSeen) {
        // CORRECCIÓN: Llamar a getTimeAgo para la actualización en tiempo real
        contactStatusText.textContent = `Última vez ${getTimeAgo(status.lastSeen)}`; 
        contactStatusText.className = 'contact-status-text offline';
    } else {
        contactStatusText.textContent = 'Desconectado';
        contactStatusText.className = 'contact-status-text offline';
    }
}


if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        // CORRECCIÓN: Usar remove en onDisconnect y set en el logout para garantizar el estado offline
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
            if (emojiPickerContainer) emojiPickerPickerContainer.classList.remove('active');
        };
    }
}

// ------------------------------------------------------------------
// --- 5. LÓGICA DE LA LISTA DE CONVERSACIONES ---
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
        
        // ************************************************************
        // ** MODIFICACIÓN CLAVE: ELIMINAR EL TEXTO DEL ÚLTIMO MENSAJE **
        // ************************************************************
        item.innerHTML = `
            <div class="contact-avatar ${isOnline ? 'online' : ''}">${contact.username.charAt(0).toUpperCase()}</div> 
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
    // 1. Limpieza de intervalos y estado
    for (const id in seenIntervals) {
        clearInterval(seenIntervals[id]);
    }
    seenIntervals = {};
    
    if (timeUpdateInterval) { // **CORRECCIÓN: Limpiar intervalo de status**
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }

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
    
    loadedMessageCount = 0; // Resetear contador

    // 2. CARGAR EL LOTE INICIAL (los últimos MESSAGES_PER_PAGE mensajes)
    loadMessages(true);
    // --- FIN LÓGICA DE PAGINACIÓN ---
    
    // 3. Resetear contador de no leídos y re-renderizar la lista
    if (CONTACTS_MAP[username]) {
         CONTACTS_MAP[username].unread = 0;
         renderConversationsList();
    }
    
    // 4. Actualizar el estado del contacto en el encabezado e INICIAR EL INTERVALO
    startContactStatusInterval(); // **CORRECCIÓN: Iniciar el intervalo de actualización de estado**
    
    // 5. APLAZAR MARCAJE COMO LEÍDO (Mantener la lógica de estabilidad)
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
    
    // 6. Reiniciar el indicador de typing para el nuevo chat
    clearTimeout(typingTimeout);
    isTypingActive = false; 
    typingTimeout = null;
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

    const interactionPartner = caseInsensitiveEquals(message.sender, currentUser) ? message.receiver : message.sender;

    if(!interactionPartner || caseInsensitiveEquals(interactionPartner, currentUser)) return;
    
    // ************************************************************
    // ** VERIFICACIÓN CLAVE: Solo procesar si es un mensaje directo **
    // ************************************************************
    const isDirectMessage = 
        (caseInsensitiveEquals(message.sender, currentUser) && caseInsensitiveEquals(message.receiver, interactionPartner)) ||
        (caseInsensitiveEquals(message.sender, interactionPartner) && caseInsensitiveEquals(message.receiver, currentUser));
    
    if(!isDirectMessage) return; // Ignorar si no es un mensaje directo.


    // 2. ACTUALIZAR LISTA DE CONTACTOS DINÁMICAMENTE (usando CONTACTS_MAP)
    let contact = CONTACTS_MAP[interactionPartner];
    
    if (!contact) {
        const status = USERS_STATUS[interactionPartner] || {};
        contact = {
            username: interactionPartner,
            // YA NO SE ALMACENA lastMessage AQUÍ
            timestamp: message.timestamp || Date.now(),
            unread: caseInsensitiveEquals(message.sender, currentUser) ? 0 : 1, 
            lastSeen: status.lastSeen || null,
            isOnline: status.isOnline || false
        };
        CONTACTS_MAP[interactionPartner] = contact;
    } else {
        // YA NO SE ACTUALIZA lastMessage AQUÍ
        contact.timestamp = message.timestamp || Date.now();
        
        // Solo aumentar el contador si el mensaje es recibido (no enviado)
        if (!caseInsensitiveEquals(message.sender, currentUser) && 
            !caseInsensitiveEquals(interactionPartner, activeChatUser)) {
             contact.unread = (contact.unread || 0) + 1;
        } else if (!caseInsensitiveEquals(message.sender, currentUser) && 
                   caseInsensitiveEquals(interactionPartner, activeChatUser) && 
                   !message.read) {
             // Si el chat está abierto, el contador no debe aumentar, pero el timestamp sí se actualiza.
             // Además, se marcará como leído en el paso 3.
        }
    }
    
    // ************************************************************
    // ** MODIFICACIÓN: LÓGICA DE NOTIFICACIÓN TOAST UNIVERSAL **
    // ************************************************************
    // Solo si el usuario actual es el RECEPTOR (se activa para todos los mensajes recibidos)
    if (caseInsensitiveEquals(message.receiver, currentUser)) { 
        
        showNotification(
            message.sender, 
            message.text, 
            interactionPartner
        );
    }
    // ************************************************************
    // ** FIN LÓGICA DE NOTIFICACIÓN TOAST **
    // ************************************************************
    
    renderConversationsList();

    // 3. MOSTRAR MENSAJE EN EL CHAT SI ESTÁ ABIERTO
    if (activeChatUser) {
        const isRelevant = 
            (caseInsensitiveEquals(message.sender, currentUser) && caseInsensitiveEquals(message.receiver, activeChatUser)) ||
            (caseInsensitiveEquals(message.sender, activeChatUser) && caseInsensitiveEquals(message.receiver, currentUser));

        if (isRelevant) {
            const index = chatMessageIds.findIndex(item => item === messageId);
            
            // Si el mensaje no está en la lista del chat activo, lo añadimos.
            if (index === -1) {
                chatMessageIds.push(messageId);
                // ¡IMPORTANTE! Reordenamos la lista de IDs para que el nuevo mensaje esté al final
                chatMessageIds.sort((a, b) => (allMessages[a].timestamp || 0) - (allMessages[b].timestamp || 0));
            }
            
            // Obtenemos el nuevo índice después de ordenar.
            const messageIndex = chatMessageIds.findIndex(id => id === messageId);
            const isLatestMessage = messageIndex === chatMessageIds.length - 1;

            // Solo renderizamos y aumentamos loadedMessageCount si es el mensaje más nuevo en tiempo real,
            // y no ha sido cargado ya.
            if (isLatestMessage && !document.getElementById(messageId)) {
                
                loadedMessageCount++;
                
                const isNearBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 200;
                
                renderAndAppendMessage(messageId, message); 

                // Marcar como leído si el chat está abierto y es un mensaje recibido
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

onChildChanged(messagesRef, (snapshot) => {
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
                 
                 const newMessageWrapper = createMessageElement(messageId, messageData);
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
    
    // Solo actualizar el estado de no leídos en la lista si el mensaje es directo
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
        // Solo decrementamos si el mensaje estaba actualmente cargado en el DOM
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
    
    // Necesario re-renderizar para actualizar el 'lastMessage' de la lista (aunque ahora no mostramos el texto)
    renderConversationsList(); 
});

// --------------------------------------------------------------------------
// --- 7. ENVÍO DE MENSAJES Y FUNCIONES AUXILIARES (Modificado para NO cifrar)---
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

        // ******** Envío de texto plano ********
        const newMessage = {
            sender: currentUser,
            receiver: activeChatUser, 
            text: messageText, // <-- Texto plano (no cifrado)
            timestamp: serverTimestamp(),
            read: false, 
            reactions: {},
        };
        // ******** FIN DE MODIFICACIÓN ********

        if (replyTo) newMessage.replyTo = replyTo;

        push(messagesRef, newMessage)
            .then(() => {
                messageInput.value = '';
                // **CORRECCIÓN: Llamar a autoResize para resetear la altura del textarea**
                messageInput.style.height = 'auto'; 

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


// Lógica de auto-resize para el textarea (si el chat.html usa textarea)
function autoResize() {
    if (messageInput) {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    }
}

if (messageInput) {
    // Escucha de entrada para el auto-resize y el estado de escritura
    messageInput.addEventListener('input', () => {
        autoResize(); // **CORRECCIÓN: Llamada a autoResize en cada input**

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
        updateChatHeaderStatus(); // Llama a la función de estado para restaurar 'En línea' / 'Última vez'
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
                        // YA NO HAY lastMessage AQUÍ
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
            // La función getTimeAgo() se usa para actualizar la hora relativa cada minuto
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
        // Corregido: usar message.replyTo.text
        quoteText.textContent = message.replyTo.text.length > 50 ? message.replyTo.text.substring(0, 50) + '...' : message.replyTo.text; 
        quoteDiv.appendChild(quoteUser);
        quoteDiv.appendChild(quoteText);
        messageContentDiv.appendChild(quoteDiv);
    }

    const textP = document.createElement('p');
    textP.className = 'message-text';
    
    // ******** Manejo de mensajes cifrados antiguos ********
    if (message.encrypted) {
        // Muestra una advertencia si el mensaje fue cifrado antes de la modificación
        textP.textContent = `[MENSAJE CIFRADO - No se puede decodificar]`;
        textP.style.color = '#e74c3c'; // Rojo para destacar
        textP.style.fontStyle = 'italic';
    } else {
        textP.textContent = message.text;
    }
    // ******** FIN DE MODIFICACIÓN ********
    
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

function renderAndAppendMessage(messageId, message) {
    const messageWrapper = createMessageElement(messageId, message);
    if (chatMessages) chatMessages.appendChild(messageWrapper);
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
        
        // ******** Manejo de texto de respuesta cifrado ********
        let replyContent = message.text;
        if (message.encrypted) {
             replyContent = `[MENSAJE CIFRADO]`;
        }
        // ******** FIN DE MODIFICACIÓN ********
        
        if (replyUser && replyText && replyPreview) {
            replyUser.textContent = message.sender;
            // Corregido: usar replyContent
            replyText.textContent = replyContent.length > 50 ? replyContent.substring(0, 50) + '...' : replyContent; 
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
    
    // Identificar si el usuario actual ha reaccionado y con qué emoji
    const userReactedEmoji = reactions[currentUser];

    for (const userId in reactions) {
        const emoji = reactions[userId];
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
    }
    for (const emoji in reactionCounts) {
        const count = reactionCounts[emoji];
        const reactionSpan = document.createElement('span');
        // Marcar como 'user-reacted' solo si el usuario actual usó ESTE emoji
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
// --- 8. LÓGICA DE PAGINACIÓN DE MENSAJES (CARGA PEREZOSA) ---
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


function loadMessages(isInitialLoad = false) {
    if (isLoadingMore || loadedMessageCount >= chatMessageIds.length) {
        removeLoadMoreIndicator();
        return;
    }
    
    isLoadingMore = true;
    showLoadingIndicator();
    
    const totalMessages = chatMessageIds.length;
    let batchIds = [];
    
    if (isInitialLoad) {
        // Carga inicial: los últimos MESSAGES_PER_PAGE mensajes (los más recientes)
        const startIndex = Math.max(0, totalMessages - MESSAGES_PER_PAGE);
        batchIds = chatMessageIds.slice(startIndex);
        
        if(chatMessages) chatMessages.innerHTML = ''; 
        
        // Renderizar y añadir al final del chatMessages
        batchIds.forEach(id => {
            renderAndAppendMessage(id, allMessages[id]);
        });
        
        loadedMessageCount = batchIds.length;
        
        if (totalMessages > loadedMessageCount) {
            addLoadMoreIndicator();
        } else {
             removeLoadMoreIndicator();
        }

        // CORRECCIÓN CLAVE: Scroll al final para ver los mensajes más recientes.
        // Un pequeño retraso para garantizar el renderizado.
        if (chatMessages && loadedMessageCount > 0) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 10); 
        }
        
    } else { 
        // Carga al hacer scroll: lote de mensajes anteriores (antiguos)
        
        const oldScrollHeight = chatMessages.scrollHeight;
        
        const endIndex = totalMessages - loadedMessageCount; 
        const startIndex = Math.max(0, endIndex - MESSAGES_PER_PAGE); 
        
        batchIds = chatMessageIds.slice(startIndex, endIndex);
        
        // Primero añadir el indicador antes de cargar
        if (startIndex > 0) {
             addLoadMoreIndicator(); 
        }
        
        // Almacenar temporalmente los elementos creados para la inserción
        const newElements = [];
        
        batchIds.forEach(id => {
            const msg = allMessages[id];
            const messageElement = createMessageElement(id, msg);
            newElements.push(messageElement);
            
            if (caseInsensitiveEquals(msg.sender, currentUser) && msg.read && msg.readAt) {
                // Configurar el indicador de visto si es un mensaje enviado
                updateSeenIndicator(messageElement, msg.readAt, id); 
            }
        });
        
        // Insertar todos los nuevos elementos en la parte superior del chat
        if (chatMessages) {
             const loadIndicator = document.getElementById('load-more-indicator');
             const insertionPoint = loadIndicator ? loadIndicator.nextSibling : chatMessages.firstChild;
             
             newElements.forEach(element => {
                 chatMessages.insertBefore(element, insertionPoint);
                 // Importante: configurar las acciones después de insertarlo en el DOM
                 const actionsDiv = element.querySelector('.message-actions');
                 if (actionsDiv) setupMessageActions(element, actionsDiv); 
             });
        }

        loadedMessageCount += batchIds.length;
        
        // Ajustar el scroll para mantener la posición del usuario
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
        // Retraso para evitar múltiples llamadas
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
    
    // **CORRECCIÓN: Llamar a autoResize en la carga inicial para el input/textarea**
    autoResize(); 
    
    renderConversationsList();
});