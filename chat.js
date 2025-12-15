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
const streaksRef = ref(database, 'streaks'); // **NUEVA REFERENCIA: Para las rachas**
const chatDurationsRef = ref(database, 'chatDurations'); // **NUEVO: Para duración de chats**


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
const inputArea = document.querySelector('.input-area'); // **CORRECCIÓN: Variable que faltaba**
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
const headerStreakIndicator = document.getElementById('header-streak-indicator'); // **NUEVO: Indicador de racha en cabecera**
const contactLocalTime = document.getElementById('contact-local-time'); // **NUEVO: Para la hora local**

// --- ELEMENTOS DE BÚSQUEDA EN CHAT (NUEVO) ---
const searchInChatButton = document.getElementById('search-in-chat-button');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const searchResultsCount = document.getElementById('search-results-count');
const prevResultButton = document.getElementById('prev-result-button');
const nextResultButton = document.getElementById('next-result-button'); // Corregido
const closeSearchButton = document.getElementById('close-search-button');
// --- LÓGICA DE NOTIFICACIÓN TOAST (NUEVOS ELEMENTOS) ---
const notificationToast = document.getElementById('notification-toast');
const toastSenderName = document.getElementById('toast-sender-name');
const toastMessageContent = document.getElementById('toast-message-content');
const toastAvatarInitial = document.getElementById('toast-avatar-initial');
const notificationSound = document.getElementById('notification-sound'); // **NUEVO: Referencia al sonido**
const userSearchInput = document.getElementById('user-search-input'); // **NUEVO: Referencia al input de búsqueda**


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
let CHAT_DURATIONS = {}; // **NUEVO: Almacena las duraciones de los chats**
let chatEnterTime = null; // **NUEVO: Timestamp de cuándo se entró al chat actual**
let STREAKS_DATA = {}; // **NUEVA VARIABLE: Para almacenar datos de rachas**
let timeUpdateInterval = null; // **NUEVA VARIABLE: Intervalo para actualizar el estado de conexión**
let localTimeInterval = null; // **NUEVO: Intervalo para la hora local del contacto**

// NUEVAS VARIABLES PARA PAGINACIÓN Y OPTIMIZACIÓN
const MESSAGES_PER_PAGE = 15; // Lote de 15 mensajes
let chatMessageIds = []; // IDs de mensajes relevantes para el chat activo, ordenados por tiempo
let loadedMessageCount = 0; // Número de mensajes cargados actualmente
let isLoadingMore = false; // Bandera para evitar múltiples cargas

// --- VARIABLES DE BÚSQUEDA (NUEVO) ---
let searchResults = [];
let currentSearchResultIndex = -1;
let isSearchActive = false;

// --- ELEMENTOS DEL MODAL DE ESTADÍSTICAS (NUEVO) ---
const statsModal = document.getElementById('stats-modal');
const closeModalButton = document.getElementById('stats-modal-close');
const creationDateEl = document.getElementById('stats-creation-date');
const messageCountEl = document.getElementById('stats-message-count');
const streakCountEl = document.getElementById('stats-streak-count');
const chatDurationEl = document.getElementById('stats-chat-duration');
const wordChartCanvas = document.getElementById('word-chart');
const deleteChatMessagesButton = document.getElementById('delete-chat-messages-button'); // **NUEVO**

// --- ELEMENTOS DEL MODAL DE REENVÍO (NUEVO) ---
const forwardModal = document.getElementById('forward-modal');
const closeForwardModalButton = document.getElementById('forward-modal-close');
const forwardContactsList = document.getElementById('forward-contacts-list');
const forwardSearchInput = document.getElementById('forward-search-input');
const cancelForwardButton = document.getElementById('cancel-forward-button');
const sendForwardButton = document.getElementById('send-forward-button');
let messageToForward = null; // Almacenará el mensaje a reenviar
let forwardRecipient = null; // Almacenará el destinatario seleccionado

// --- ELEMENTOS DEL MODAL DE EDICIÓN (NUEVO) ---
const editModal = document.getElementById('edit-modal');
const closeEditModalButton = document.getElementById('edit-modal-close');
const editMessageInput = document.getElementById('edit-message-input');
const cancelEditButton = document.getElementById('cancel-edit-button');
const saveEditButton = document.getElementById('save-edit-button');
let messageToEditId = null; // Almacenará el ID del mensaje a editar


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
    if (caseInsensitiveEquals(username, activeChatUser) && document.hasFocus()) {
        return;
    }

    // 1. Limpiar cualquier temporizador existente
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        notificationTimeout = null;
    }

    // 2. Rellenar el contenido
    toastSenderName.textContent = senderName;
    toastMessageContent.textContent = messageText;
    if (toastAvatarInitial) toastAvatarInitial.textContent = senderName.charAt(0).toUpperCase();

    // 3. Mostrar la notificación con transición
    if (notificationToast) {
        notificationToast.style.display = 'flex';
        setTimeout(() => {
            notificationToast.classList.add('show'); // La clase 'show' ahora controla la posición
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
            closeSearch(); // Cierra la búsqueda si está activa
            
            notificationToast.classList.remove('show');
            if (notificationTimeout) {
                clearTimeout(notificationTimeout);
                notificationTimeout = null;
            }
        };
    }
}


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
        
        renderConversationsList(userSearchInput ? userSearchInput.value : '');
        // Llamada inicial/de cambio para actualizar el estado del chat activo
        updateChatHeaderStatus(); 
    });

    // **NUEVO LISTENER: Escuchar cambios en las rachas**
    onValue(streaksRef, (snapshot) => {
        if (snapshot.exists()) {
            STREAKS_DATA = snapshot.val();
        } else {
            STREAKS_DATA = {};
        }
        // Re-renderizar la lista de conversaciones para mostrar/actualizar las rachas
        renderConversationsList(userSearchInput ? userSearchInput.value : '');
        updateHeaderStreak(); // **NUEVO: Actualizar la racha en la cabecera también**
    });

    // **NUEVO LISTENER: Escuchar cambios en las duraciones de los chats**
    onValue(chatDurationsRef, (snapshot) => {
        if (snapshot.exists()) {
            CHAT_DURATIONS = snapshot.val();
        } else {
            CHAT_DURATIONS = {};
        }
        // Si el modal está abierto, podríamos querer actualizarlo en tiempo real, pero por ahora lo dejamos así.
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
        // **NUEVO: Guardar la duración del chat activo antes de salir**
        if (activeChatUser && chatEnterTime) {
            const duration = Date.now() - chatEnterTime;
            updateChatDuration(activeChatUser, duration);
        }

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

/**
 * Renderiza la lista de conversaciones, opcionalmente filtrada por un término de búsqueda.
 * @param {string} [searchTerm=''] - El término para filtrar usuarios.
 */
function renderConversationsList(searchTerm = '') {
    if (!conversationsContainer) return;

    conversationsContainer.innerHTML = '';
    
    let contactsToRender = [];
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    if (searchTerm) {
        // Modo Búsqueda: Filtra TODOS los usuarios conocidos
        contactsToRender = Object.keys(USERS_STATUS)
            .filter(username => !caseInsensitiveEquals(username, currentUser) && username.toLowerCase().includes(lowerCaseSearchTerm))
            .map(username => {
                // Si el usuario ya está en nuestros contactos, usamos sus datos, si no, creamos un objeto básico
                return CONTACTS_MAP[username] || { username, timestamp: 0, unread: 0 };
            });
    } else {
        // Modo Normal: Muestra las conversaciones existentes
        contactsToRender = Object.values(CONTACTS_MAP);
    }
    
    const sortedContacts = contactsToRender.sort((a, b) => b.timestamp - a.timestamp);

    for (const contact of sortedContacts) {
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
        
        // **LÓGICA DE RACHA: Obtener la racha para este contacto**
        const streakKey = [currentUser, contact.username].sort().join('_');
        const streakData = STREAKS_DATA[streakKey];
        let streakHtml = '';

        if (streakData && streakData.count > 0) {
            const today = new Date().setHours(0, 0, 0, 0);
            const lastInteractionDay = new Date(streakData.lastInteraction).setHours(0, 0, 0, 0);
            const oneDay = 24 * 60 * 60 * 1000;

            if (today === lastInteractionDay) {
                // Racha activa hoy (roja)
                streakHtml = `<span class="streak-indicator">🔥 ${streakData.count}</span>`;
            } else if (today - lastInteractionDay === oneDay) {
                // Racha en periodo de gracia (gris)
                streakHtml = `<span class="streak-indicator grace-period">🔥 ${streakData.count}</span>`;
            }
            // Si han pasado más de 48h, la racha está rota y no se muestra. `updateStreak` la reseteará.
        }
        // ************************************************************
        // ** MODIFICACIÓN CLAVE: ELIMINAR EL TEXTO DEL ÚLTIMO MENSAJE **
        // ************************************************************
        item.innerHTML = `
            <div class="contact-avatar ${isOnline ? 'online' : ''}">${contact.username.charAt(0).toUpperCase()}</div> 
            <div class="chat-details">
                <span class="chat-name">${contact.username}</span>
                <p class="last-message">${streakHtml}
                    ${!searchTerm && contact.unread > 0 ? `<span class="unread-count-placeholder">Mensajes nuevos</span>` : (searchTerm ? 'Tocar para chatear' : '&nbsp;')}
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
            // **NUEVO: Limpiar la búsqueda al seleccionar un chat**
            if (userSearchInput) {
                userSearchInput.value = '';
                renderConversationsList(); // Volver a la vista normal
            }
        });

        conversationsContainer.appendChild(item);
    }
}

function setActiveChat(username) {
    // **NUEVO: Guardar la duración del chat que se está dejando**
    if (activeChatUser && chatEnterTime) {
        const duration = Date.now() - chatEnterTime;
        if (duration > 1000) { // Solo guardar si es más de 1 segundo
            updateChatDuration(activeChatUser, duration);
        }
    }
    // **FIN NUEVO**

    // 1. Limpieza de intervalos y estado anterior
    for (const id in seenIntervals) {
        clearInterval(seenIntervals[id]);
    }
    seenIntervals = {};
    
    if (timeUpdateInterval) { // **CORRECCIÓN: Limpiar intervalo de status**
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }
    if (localTimeInterval) { // **NUEVO: Limpiar intervalo de hora local**
        clearInterval(localTimeInterval);
        localTimeInterval = null;
        if (contactLocalTime) contactLocalTime.style.display = 'none';
    }

    // **NUEVO: Iniciar el cronómetro para el nuevo chat**
    chatEnterTime = Date.now();

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
         renderConversationsList(userSearchInput ? userSearchInput.value : '');
    }
    
    // 4. Actualizar el estado del contacto en el encabezado e INICIAR EL INTERVALO
    startContactStatusInterval(); // **CORRECCIÓN: Iniciar el intervalo de actualización de estado**
    updateHeaderStreak(); // **NUEVO: Actualizar la racha en la cabecera al cambiar de chat**

    // **NUEVO: Iniciar el reloj de hora local si corresponde**
    startLocalTimeClock();
    
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

/**
 * **NUEVO: Inicia un reloj en tiempo real si el chat es entre 'aynara' y 'dylan'.**
 */
function startLocalTimeClock() {
    if (!contactLocalTime) return;

    const isAynaraChattingWithDylan = caseInsensitiveEquals(currentUser, 'aynara') && caseInsensitiveEquals(activeChatUser, 'dylan');
    const isDylanChattingWithAynara = caseInsensitiveEquals(currentUser, 'dylan') && caseInsensitiveEquals(activeChatUser, 'aynara');

    if (isAynaraChattingWithDylan || isDylanChattingWithAynara) {
        const timeZone = isAynaraChattingWithDylan ? 'Indian/Mauritius' : 'Europe/Madrid';
        const countryName = isAynaraChattingWithDylan ? 'Mauricio' : 'España';
        
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('es-ES', { // Formato HH:MM:SS
                timeZone: timeZone,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            contactLocalTime.innerHTML = `<span class="time-prefix"> </span>${countryName}: ${timeString}`;
        };

        // Mostrar el elemento y ejecutar la primera actualización
        contactLocalTime.style.display = 'block';
        updateTime();

        // Iniciar el intervalo para actualizar cada segundo
        localTimeInterval = setInterval(updateTime, 1000);

    } else {
        // Si no es el chat específico, ocultar el reloj
        contactLocalTime.style.display = 'none';
    }
}


/**
 * **NUEVO: Actualiza la duración total de un chat en Firebase.**
 * @param {string} chatPartner - El usuario con el que se está chateando.
 * @param {number} durationToAdd - La duración en milisegundos a añadir.
 */
async function updateChatDuration(chatPartner, durationToAdd) {
    const chatKey = [currentUser, chatPartner].sort().join('_');
    const durationRef = ref(database, `chatDurations/${chatKey}`);

    try {
        const snapshot = await get(durationRef);
        const currentDuration = snapshot.exists() ? snapshot.val() : 0;
        await set(durationRef, currentDuration + durationToAdd);
    } catch (error) {
        console.error("Error al actualizar la duración del chat:", error);
    }
}

/**
 * Actualiza el indicador de racha en la cabecera del chat activo.
 */
function updateHeaderStreak() {
    if (!activeChatUser || !headerStreakIndicator) return;

    const streakKey = [currentUser, activeChatUser].sort().join('_');
    const streakData = STREAKS_DATA[streakKey];

    headerStreakIndicator.innerHTML = '';
    headerStreakIndicator.className = '';

    if (streakData && streakData.count > 0) {
        const today = new Date().setHours(0, 0, 0, 0);
        const lastInteractionDay = new Date(streakData.lastInteraction).setHours(0, 0, 0, 0);
        const oneDay = 24 * 60 * 60 * 1000;

        let streakClass = '';
        if (today === lastInteractionDay) {
            // Racha activa hoy (roja)
            streakClass = 'streak-indicator';
        } else if (today - lastInteractionDay === oneDay) {
            // Racha en periodo de gracia (gris)
            streakClass = 'streak-indicator grace-period';
        }

        headerStreakIndicator.className = streakClass;
        headerStreakIndicator.innerHTML = `🔥 ${streakData.count}`;
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
    // **CORRECCIÓN: La lógica de notificación se ha movido y mejorado en showNotification()**
    // Solo se llama si el usuario actual es el RECEPTOR y el mensaje no está leído.
    if (caseInsensitiveEquals(message.receiver, currentUser) && !message.read) {
        // **NUEVO: Forzar la reproducción del sonido aquí**
        // Esto asegura que el sonido se intente reproducir incluso si la notificación visual no se muestra.
        if (notificationSound) {
            notificationSound.currentTime = 0;
            notificationSound.play().catch(error => {
                console.warn("No se pudo reproducir el sonido (el usuario necesita interactuar con la página):", error.message);
            });
        }

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
             renderConversationsList(userSearchInput ? userSearchInput.value : ''); 
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
    renderConversationsList(userSearchInput ? userSearchInput.value : ''); 
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

                updateStreak(currentUser, activeChatUser); // **NUEVO: Actualizar la racha al enviar mensaje**

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

/**
 * Comprueba y actualiza la racha entre dos usuarios.
 * @param {string} user1 - El usuario actual.
 * @param {string} user2 - El otro usuario en el chat.
 */
async function updateStreak(user1, user2) {
    // Clave única para la racha entre dos usuarios, independientemente del orden.
    const streakKey = [user1, user2].sort().join('_');
    const streakDataRef = ref(database, `streaks/${streakKey}`);
    const now = Date.now();
    const todayTimestamp = new Date(now).setHours(0, 0, 0, 0);

    try {
        const snapshot = await get(streakDataRef);
        const currentStreakData = snapshot.val() || { count: 0, lastInteraction: 0, participants: {} };

        // Actualizar la marca de tiempo de la última participación del usuario actual.
        currentStreakData.participants[user1] = now;

        const otherUserLastParticipation = currentStreakData.participants[user2] || 0;
        const lastInteractionDay = new Date(currentStreakData.lastInteraction).setHours(0, 0, 0, 0);
        
        // Definimos el inicio del día de ayer.
        const yesterdayTimestamp = new Date(todayTimestamp);
        yesterdayTimestamp.setDate(yesterdayTimestamp.getDate() - 1);

        // Condición 1: ¿Ambos usuarios han participado en las últimas 24 horas?
        const bothParticipatedRecently = (now - otherUserLastParticipation) < (24 * 60 * 60 * 1000);

        if (currentStreakData.count === 0) {
            // Si no hay racha, se inicia a 1 solo si ambos han participado recientemente.
            if (bothParticipatedRecently) {
                currentStreakData.count = 1;
                currentStreakData.lastInteraction = todayTimestamp;
            }
        } else {
            // Ya existe una racha.
            if (bothParticipatedRecently) {
                // Si la última interacción fue ayer, la racha aumenta.
                if (lastInteractionDay === yesterdayTimestamp) {
                    currentStreakData.count++;
                    currentStreakData.lastInteraction = todayTimestamp;
                } 
                // Si la última interacción no fue hoy ni ayer, la racha se rompió. Se reinicia a 1.
                else if (lastInteractionDay < yesterdayTimestamp) {
                    currentStreakData.count = 1;
                    currentStreakData.lastInteraction = todayTimestamp;
                }
                // Si la última interacción fue hoy, no se hace nada con el contador, solo se actualiza la participación.
            } else {
                // El otro usuario no ha participado en 24h. La racha se rompe y se reinicia a 1.
                currentStreakData.count = 1;
                currentStreakData.lastInteraction = todayTimestamp;
                // Se borra la participación del otro usuario para que la racha no continúe hasta que vuelva a participar.
                delete currentStreakData.participants[user2];
            }
        }

        // Guardar los datos actualizados en Firebase
        await set(streakDataRef, currentStreakData);

    } catch (error) {
        console.error("Error al actualizar la racha:", error);
    }
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
                    renderConversationsList(userSearchInput ? userSearchInput.value : ''); 
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
    
    // --- NUEVO: Indicador de Mensaje Reenviado ---
    if (message.forwardedFrom) {
        const forwardedIndicator = document.createElement('div');
        forwardedIndicator.className = 'forwarded-indicator';
        forwardedIndicator.innerHTML = `<i class="fas fa-share"></i> Mensaje reenviado`;
        messageContentDiv.appendChild(forwardedIndicator);
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
        // textP.style.color = 'var(--dynamic-text-color)'; // **NUEVO: Aplicar color de texto dinámico**
    }
    // ******** FIN DE MODIFICACIÓN ********
    
    messageContentDiv.appendChild(textP);

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'message-time';
    
    let checkIconHtml = '';
    let editedIndicator = ''; // NUEVO

    if (isSentByCurrentUser) {
        const readClass = message.read ? ' read' : ''; 
        checkIconHtml = `<i class="fas fa-check-double checkmark${readClass}"></i>`;
    }
    
    // --- NUEVO: Indicador de Mensaje Editado ---
    if (message.editedAt) {
        // Usamos un estilo sutil para el indicador de editado
        editedIndicator = `<span style="font-size: 10px; opacity: 0.7; margin-left: 5px;">(editado)</span>`;
    }
    // --- FIN NUEVO ---

    // Modificado para incluir el indicador de editado
    timestampSpan.innerHTML = formatTimestamp(message.timestamp) + (isSentByCurrentUser ? ` ${checkIconHtml}` : '') + editedIndicator;
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

function renderAndAppendMessage(messageId, message, skipDateSeparator = false) {
    const messageWrapper = createMessageElement(messageId, message);
    chatMessages.appendChild(messageWrapper);
    
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
    if (isSearchActive) replyButton.disabled = true; // Deshabilitar si la búsqueda está activa
    actionsDiv.appendChild(replyButton);
    
    // --- NUEVO: Botón de Reenviar ---
    const forwardButton = document.createElement('button');
    forwardButton.innerHTML = '<i class="fas fa-share"></i>';
    forwardButton.title = 'Reenviar';
    forwardButton.className = 'action-button forward-button'; // Clase para identificarlo
    forwardButton.onclick = (e) => {
        e.stopPropagation();
        openForwardModal(messageId, message);
        closeAllMessageActions();
    };
    if (isSearchActive) {
        forwardButton.disabled = true;
    }
    actionsDiv.appendChild(forwardButton);
    // --- FIN NUEVO ---

    // --- NUEVO: Botón de Editar (Re-añadido) ---
    if (isSentByCurrentUser) {
        const editButton = document.createElement('button');
        editButton.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        editButton.title = 'Editar';
        editButton.className = 'action-button edit-button';
        editButton.onclick = (e) => {
            e.stopPropagation();
            openEditModal(messageId, message);
            closeAllMessageActions();
        };
        if (isSearchActive) editButton.disabled = true;
        actionsDiv.appendChild(editButton);
    }
    // --- FIN NUEVO ---

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
        if (isSearchActive) deleteButton.disabled = true; // Deshabilitar si la búsqueda está activa
        actionsDiv.appendChild(deleteButton);
    }
    
    const reactButton = document.createElement('button');
    reactButton.innerHTML = '<i class="far fa-smile-wink"></i>'; 
    reactButton.title = 'Reaccionar';
    reactButton.className = 'action-button';
    actionsDiv.appendChild(reactButton);
    if (isSearchActive) reactButton.disabled = true; // Deshabilitar si la búsqueda está activa
    
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

// ==========================================================
// --- 11.5 LÓGICA PARA EDITAR MENSAJES (NUEVO) ---
// ==========================================================

/**
 * Abre el modal para editar un mensaje.
 * @param {string} messageId - El ID del mensaje a editar.
 * @param {object} message - El objeto del mensaje.
 */
function openEditModal(messageId, message) {
    messageToEditId = messageId;
    editMessageInput.value = message.text; // Cargar el texto actual en el textarea
    editModal.classList.add('show');
    editMessageInput.focus();
}

/**
 * Cierra el modal de edición.
 */
function closeEditModal() {
    editModal.classList.remove('show');
    messageToEditId = null;
    editMessageInput.value = '';
}

/**
 * Guarda los cambios del mensaje editado en Firebase.
 */
async function handleSaveEdit() {
    const newText = editMessageInput.value.trim();

    if (!messageToEditId || newText === '') {
        alert("El mensaje no puede estar vacío.");
        return;
    }

    const messageRef = ref(database, `messages/${messageToEditId}`);

    try {
        // Actualizamos el texto y añadimos una marca de tiempo de edición
        await update(messageRef, {
            text: newText,
            editedAt: serverTimestamp()
        });
        console.log(`Mensaje ${messageToEditId} editado.`);
        closeEditModal();
    } catch (error) {
        console.error("Error al editar el mensaje:", error);
        alert("Hubo un error al guardar los cambios.");
    }
}

// --- Event Listeners para el modal de edición ---
if (editModal) {
    closeEditModalButton.addEventListener('click', closeEditModal);
    cancelEditButton.addEventListener('click', closeEditModal);
    saveEditButton.addEventListener('click', handleSaveEdit);
    editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });
}

// ==========================================================
// --- 11. LÓGICA PARA REENVIAR MENSAJES (NUEVO) ---
// ==========================================================

/**
 * Abre el modal para seleccionar un contacto a quien reenviar el mensaje.
 * @param {string} messageId - El ID del mensaje a reenviar.
 * @param {object} message - El objeto del mensaje a reenviar.
 */
function openForwardModal(messageId, message) {
    messageToForward = message;
    forwardRecipient = null; // Limpiar selección anterior
    sendForwardButton.disabled = true; // Deshabilitar botón de envío
    forwardSearchInput.value = ''; // Limpiar búsqueda

    renderForwardContactsList(); // Renderizar la lista de contactos
    forwardModal.classList.add('show');
}

/**
 * Cierra el modal de reenvío.
 */
function closeForwardModal() {
    forwardModal.classList.remove('show');
    messageToForward = null;
    forwardRecipient = null;
}

/**
 * Renderiza la lista de contactos en el modal de reenvío, opcionalmente filtrada.
 * @param {string} [searchTerm=''] - Término de búsqueda para filtrar contactos.
 */
function renderForwardContactsList(searchTerm = '') {
    forwardContactsList.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    const contacts = Object.keys(CONTACTS_MAP)
        .filter(username => username.toLowerCase().includes(lowerCaseSearchTerm));

    if (contacts.length === 0) {
        forwardContactsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No se encontraron contactos.</p>';
        return;
    }

    contacts.forEach(username => {
        const item = document.createElement('div');
        item.className = 'conversation-item'; // Reutilizamos el estilo
        item.dataset.username = username;
        item.innerHTML = `
            <div class="contact-avatar">${username.charAt(0).toUpperCase()}</div>
            <div class="chat-details">
                <span class="chat-name">${username}</span>
            </div>
        `;
        item.addEventListener('click', () => {
            // Desmarcar el anterior seleccionado
            const currentSelected = forwardContactsList.querySelector('.active');
            if (currentSelected) {
                currentSelected.classList.remove('active');
            }
            // Marcar el nuevo
            item.classList.add('active');
            forwardRecipient = username;
            sendForwardButton.disabled = false; // Habilitar el botón de envío
        });
        forwardContactsList.appendChild(item);
    });
}

/**
 * Envía el mensaje reenviado al destinatario seleccionado.
 */
function handleForwardSend() {
    if (!messageToForward || !forwardRecipient) {
        alert("Error: No se ha seleccionado un mensaje o un destinatario.");
        return;
    }

    const forwardedMessage = {
        sender: currentUser,
        receiver: forwardRecipient,
        text: messageToForward.text, // El texto original
        timestamp: serverTimestamp(),
        read: false,
        reactions: {},
        // Añadimos una marca para saber que es reenviado y de quién
        forwardedFrom: messageToForward.sender 
    };

    push(messagesRef, forwardedMessage)
        .then(() => {
            console.log(`Mensaje reenviado a ${forwardRecipient}`);
            closeForwardModal();
            // Opcional: Mostrar una confirmación visual
            alert(`Mensaje reenviado a ${forwardRecipient}`);
        })
        .catch(error => {
            console.error("Error al reenviar el mensaje:", error);
            alert("Hubo un error al reenviar el mensaje.");
        });
}

// --- Event Listeners para el modal de reenvío ---
if (forwardModal) {
    closeForwardModalButton.addEventListener('click', closeForwardModal);
    cancelForwardButton.addEventListener('click', closeForwardModal);
    sendForwardButton.addEventListener('click', handleForwardSend);

    forwardSearchInput.addEventListener('input', (e) => {
        renderForwardContactsList(e.target.value);
    });

    // Cerrar si se hace clic en el fondo
    forwardModal.addEventListener('click', (event) => {
        if (event.target === forwardModal) {
            closeForwardModal();
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
            const currentMessage = allMessages[id];
            renderAndAppendMessage(id, currentMessage);
        });
        // CORRECCIÓN: Insertar todos los separadores de fecha después de renderizar los mensajes.
        insertDateSeparatorsForExistingMessages();
        
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
        
        // Iterar en orden inverso para la lógica de fecha
        [...batchIds].reverse().forEach((id, index) => {
            const msg = allMessages[id];
            const messageElement = createMessageElement(id, msg);
            
            // La inserción se hará al revés, así que el elemento va primero
            newElements.unshift(messageElement);
            
            if (caseInsensitiveEquals(msg.sender, currentUser) && msg.read && msg.readAt) {
                // Configurar el indicador de visto si es un mensaje enviado
                updateSeenIndicator(messageElement, msg.readAt, id); 
            }
        });
        
        // CORRECCIÓN: Insertar todos los nuevos elementos primero.
        if (chatMessages) {
             const loadIndicator = document.getElementById('load-more-indicator');
             const insertionPoint = loadIndicator ? loadIndicator.nextSibling : chatMessages.firstChild;
             newElements.forEach(element => chatMessages.insertBefore(element, insertionPoint));
        }

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
    
    // CORRECCIÓN: Volver a calcular e insertar TODOS los separadores de fecha después de cualquier carga.
    insertDateSeparatorsForExistingMessages();

    hideLoadingIndicator();
    isLoadingMore = false;
}

/**
 * NUEVO: Crea y devuelve un elemento separador de fecha si es necesario.
 * @param {object} currentMessage - El mensaje actual que se va a renderizar.
 * @param {object} previousMessage - El mensaje anterior en la cronología.
 * @returns {HTMLElement|null} El elemento del separador o null.
 */
function createDateSeparatorIfNeeded(currentMessage, previousMessage) {
    if (!currentMessage || !currentMessage.timestamp) return null;

    const currentDate = new Date(currentMessage.timestamp);

    // Si no hay mensaje previo, siempre se muestra la fecha del primero.
    if (!previousMessage || !previousMessage.timestamp) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.textContent = formatDateSeparator(currentDate);
        return separator;
    }

    const previousDate = new Date(previousMessage.timestamp);

    // Comprobar si son de días diferentes
    if (currentDate.toDateString() !== previousDate.toDateString()) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.textContent = formatDateSeparator(currentDate);
        return separator;
    }

    return null;
}

/**
 * CORRECCIÓN: Nueva función centralizada para insertar todos los separadores de fecha.
 * Recorre los mensajes existentes en el DOM y añade los separadores donde corresponde.
 */
function insertDateSeparatorsForExistingMessages() {
    // 1. Eliminar todos los separadores existentes para evitar duplicados.
    chatMessages.querySelectorAll('.date-separator').forEach(sep => sep.remove());

    // 2. Recorrer los mensajes y volver a insertar los separadores.
    const messageElements = Array.from(chatMessages.querySelectorAll('.message-wrapper'));
    let previousMessage = null;
    messageElements.forEach(msgElement => {
        const currentMessage = allMessages[msgElement.id];
        const separator = createDateSeparatorIfNeeded(currentMessage, previousMessage);
        if (separator) msgElement.before(separator);
        previousMessage = currentMessage;
    });
}
/**
 * NUEVO: Formatea la fecha para mostrarla en el separador.
 * @param {Date} date - El objeto Date a formatear.
 * @returns {string} La fecha formateada como "HOY", "AYER" o "DÍA MES AÑO".
 */
function formatDateSeparator(date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'HOY';
    if (date.toDateString() === yesterday.toDateString()) return 'AYER';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
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

// ------------------------------------------------------------------
// --- 9. LÓGICA DE BÚSQUEDA DE MENSAJES (NUEVO) ---
// ------------------------------------------------------------------

function openSearch() {
    if (!activeChatUser) return;
    isSearchActive = true;
    searchBar.style.display = 'flex';
    chatHeader.style.display = 'none'; // Ocultar la cabecera normal
    inputArea.style.display = 'none'; // Ocultar el área de input
    searchInput.focus();
    // Deshabilitar acciones de mensajes mientras se busca
    document.querySelectorAll('.message-wrapper').forEach(el => el.classList.add('search-active'));
}

function closeSearch() {
    isSearchActive = false;
    searchBar.style.display = 'none';
    chatHeader.style.display = 'flex'; // Mostrar la cabecera normal
    searchInput.value = '';
    inputArea.style.display = 'block'; // Mostrar de nuevo el área de input
    searchResults = [];
    currentSearchResultIndex = -1;
    searchResultsCount.textContent = '0/0';
    // Limpiar todos los resaltados
    document.querySelectorAll('mark.search-highlight').forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize(); // Une nodos de texto adyacentes
    });
    document.querySelectorAll('.message-wrapper.current-search-hit').forEach(el => {
        el.classList.remove('current-search-hit');
    });
    // Habilitar acciones de mensajes de nuevo
    document.querySelectorAll('.message-wrapper').forEach(el => el.classList.remove('search-active'));

    // Restaurar la vista de chat paginada
    loadMessages(true);
}

function executeSearch() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    if (searchTerm.length < 2) {
        searchResults = [];
        currentSearchResultIndex = -1;
        searchResultsCount.textContent = '0/0';
        return;
    }

    searchResults = [];
    chatMessages.innerHTML = ''; // Limpiar la vista antes de mostrar resultados

    // Busca en todos los mensajes del chat activo, no solo los cargados
    const reversedMessageIds = [...chatMessageIds].reverse(); // Empezar por los más recientes
    for (const msgId of reversedMessageIds) {
        const message = allMessages[msgId];
        if (message && message.text.toLowerCase().includes(searchTerm)) {
            searchResults.push(msgId);
        }
    }

    if (searchResults.length > 0) {
        // Renderizar todos los resultados encontrados
        searchResults.forEach(id => renderAndAppendMessage(id, allMessages[id]));
        // Navegar al primer resultado (el más reciente)
        currentSearchResultIndex = 0;
        navigateToSearchResult(0);
    } else {
        currentSearchResultIndex = -1;
        searchResultsCount.textContent = '0/0';
        alert('No se encontraron resultados.');
    }
}

function navigateToSearchResult(index) {
    if (index < 0 || index >= searchResults.length) return;

    currentSearchResultIndex = index;
    const messageId = searchResults[index];

    // Limpiar resaltado anterior
    document.querySelectorAll('.message-wrapper.current-search-hit').forEach(el => {
        el.classList.remove('current-search-hit');
    });

    const messageElement = document.getElementById(messageId);

    if (messageElement) {
        // Resaltar el texto en el elemento encontrado
        highlightTextInNode(messageElement, searchInput.value.trim());

        // Scroll y resaltado del mensaje
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.classList.add('current-search-hit');
        
        // Actualizar contador
        searchResultsCount.textContent = `${index + 1}/${searchResults.length}`;
    } 
}

function highlightTextInNode(node, searchTerm) {
    // Primero, limpiar resaltados antiguos dentro de este nodo
    node.querySelectorAll('mark.search-highlight').forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });

    const textNodes = [];
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while (n = walk.nextNode()) {
        textNodes.push(n);
    }

    textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const regex = new RegExp(`(${searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
        if (regex.test(text)) {
            const fragment = document.createDocumentFragment();
            text.split(regex).forEach((part, i) => {
                if (i % 2 === 1) { // Es el término de búsqueda
                    const mark = document.createElement('mark');
                    mark.className = 'search-highlight';
                    mark.textContent = part;
                    fragment.appendChild(mark);
                } else if (part) {
                    fragment.appendChild(document.createTextNode(part));
                }
            });
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    });
}

// --- Event Listeners para Búsqueda ---

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    // --- Event Listeners para Búsqueda (Corregido) ---
    const statsButton = document.getElementById('chat-stats-button');
    if (statsButton) statsButton.addEventListener('click', openStatsModal);

    if (searchInChatButton) searchInChatButton.addEventListener('click', openSearch);
    if (closeSearchButton) closeSearchButton.addEventListener('click', closeSearch);
    if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); executeSearch(); } });
    if (prevResultButton) prevResultButton.addEventListener('click', () => navigateToSearchResult(currentSearchResultIndex - 1));
    if (nextResultButton) nextResultButton.addEventListener('click', () => navigateToSearchResult(currentSearchResultIndex + 1));

    const username = sessionStorage.getItem('username');
    if (username) {
        const userAvatarMain = document.getElementById('user-avatar-main');
        if (userAvatarMain) {
            userAvatarMain.textContent = username.charAt(0).toUpperCase();
        }
    }
    
    // **CORRECCIÓN: Llamar a autoResize en la carga inicial para el input/textarea**
    autoResize(); 
    
    // **CORRECCIÓN: Mover el listener del buscador de usuarios a la inicialización.**
    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            // Re-renderizar la lista de conversaciones con el término de búsqueda.
            renderConversationsList(searchTerm);
        });
    }

    renderConversationsList();
});

// ==========================================================
// --- 10. LÓGICA DE ELIMINACIÓN DE MENSAJES DE CHAT (NUEVO) ---
// ==========================================================

if (deleteChatMessagesButton) {
    deleteChatMessagesButton.addEventListener('click', () => {
        if (!activeChatUser) {
            alert("Por favor, selecciona un chat para poder eliminar sus mensajes.");
            return;
        }

        if (confirm(`¿Estás seguro de que quieres eliminar todos los mensajes de este chat con "${activeChatUser}"? Esta acción no se puede deshacer.`)) {
            deleteMessagesForCurrentChat();
        }
    });
}

/**
 * Elimina todos los mensajes del chat activo de la base de datos y de la vista.
 */
function deleteMessagesForCurrentChat() {
    if (!activeChatUser || chatMessageIds.length === 0) {
        return; // No hay nada que borrar
    }

    const updates = {};
    // Prepara una actualización masiva para borrar todos los mensajes a la vez
    chatMessageIds.forEach(id => {
        updates[`messages/${id}`] = null; // Poner a null un path en Firebase lo elimina
    });

    update(ref(database), updates)
        .then(() => {
            console.log(`Mensajes del chat con ${activeChatUser} eliminados.`);
            // No es necesario limpiar la UI manualmente, ya que el listener `onChildRemoved`
            // se encargará de quitar cada mensaje de la vista y de `allMessages`.
        })
        .catch(error => console.error("Error al eliminar los mensajes del chat:", error));
}

// ==========================================================
// --- 10. LÓGICA DEL MODAL DE ESTADÍSTICAS (NUEVO) ---
// ==========================================================

let wordChart = null; // Variable para mantener la instancia del gráfico

/**
 * Abre el modal de estadísticas y carga los datos.
 */
const openStatsModal = () => {
    if (!activeChatUser) {
        alert("Por favor, selecciona un chat para ver sus estadísticas.");
        return;
    }
    statsModal.classList.add('show');
    loadChatStatistics(); 
};

/**
 * Cierra el modal de estadísticas y limpia el gráfico.
 */
const closeStatsModal = () => {
    statsModal.classList.remove('show');
    // Destruye el gráfico anterior para evitar problemas al reabrir
    if (wordChart) {
        wordChart.destroy();
        wordChart = null;
    }
};

// --- Event Listeners para el modal ---
if (closeModalButton) closeModalButton.addEventListener('click', closeStatsModal);

// Cierra el modal si se hace clic en el overlay (fondo oscuro)
if (statsModal) {
    statsModal.addEventListener('click', (event) => {
        if (event.target === statsModal) {
            closeStatsModal();
        }
    });
}

/**
 * Calcula y muestra todas las estadísticas para el chat activo.
 */
function loadChatStatistics() {
    // 1. OBTENER LOS MENSAJES RELEVANTES
    const relevantMessages = chatMessageIds.map(id => allMessages[id]);

    if (!relevantMessages || relevantMessages.length === 0) {
        creationDateEl.textContent = 'N/A';
        messageCountEl.textContent = '0';
        streakCountEl.textContent = '0 días';
        chatDurationEl.textContent = '0 horas';
        if (wordChart) wordChart.destroy();
        wordChartCanvas.getContext('2d').clearRect(0, 0, wordChartCanvas.width, wordChartCanvas.height);
        return;
    }

    // 2. CALCULAR ESTADÍSTICAS
    // Fecha de creación (timestamp del primer mensaje)
    const creationTimestamp = relevantMessages[0].timestamp;
    const creationDate = new Date(creationTimestamp).toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    // Total de mensajes
    const totalMessages = relevantMessages.length;

    // Racha actual
    const streakKey = [currentUser, activeChatUser].sort().join('_');
    const streakData = STREAKS_DATA[streakKey];
    const currentStreak = streakData ? streakData.count : 0;

    // Duración de la conversación (desde el primer al último mensaje)
    // **NUEVO: Obtener la duración desde Firebase**
    const durationKey = [currentUser, activeChatUser].sort().join('_');
    const totalDurationMs = CHAT_DURATIONS[durationKey] || 0;
    // Convertir a minutos y redondear
    const totalMinutes = Math.round(totalDurationMs / (1000 * 60));


    // Top 5 palabras más repetidas
    const wordCounts = {};
    // Lista de palabras comunes en español a ignorar
    const stopWords = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'con', 'por', 'para', 'qué', 'que', 'es', 'está', 'muy', 'mi', 'tu', 'su', 'al', 'del', 'no', 'si', 'pero', 'o', 'se', 'lo', 'me', 'te']);

    relevantMessages.forEach(msg => {
        // Usamos una expresión regular para encontrar solo palabras (incluyendo acentos)
        const words = msg.text.toLowerCase().match(/[\p{L}]+/gu) || [];
        words.forEach(word => {
            if (word.length > 2 && !stopWords.has(word) && isNaN(word)) { // Ignorar palabras cortas, stop words y números
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            }
        });
    });

    const sortedWords = Object.entries(wordCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    // 3. MOSTRAR ESTADÍSTICAS EN EL MODAL
    creationDateEl.textContent = creationDate;
    messageCountEl.textContent = totalMessages;
    streakCountEl.textContent = `${currentStreak} ${currentStreak === 1 ? 'día' : 'días'}`;
    chatDurationEl.textContent = `${totalMinutes} ${totalMinutes === 1 ? 'minuto' : 'minutos'}`;

    // 4. RENDERIZAR EL GRÁFICO
    if (wordChart) {
        wordChart.destroy(); // Destruir el gráfico anterior si existe
    }
    
    // No renderizar el gráfico si no hay palabras que mostrar
    if (sortedWords.length === 0) {
        wordChartCanvas.getContext('2d').clearRect(0, 0, wordChartCanvas.width, wordChartCanvas.height);
        return;
    }

    wordChart = new Chart(wordChartCanvas, {
        type: 'bar',
        data: {
            labels: sortedWords.map(item => item[0]),
            datasets: [{
                label: 'Repeticiones',
                data: sortedWords.map(item => item[1]),
                backgroundColor: 'rgba(0, 132, 255, 0.7)',
                borderColor: 'rgba(0, 132, 255, 1)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Hace el gráfico de barras horizontal para mejor legibilidad
            scales: {
                x: {
                    // **CORRECCIÓN: El eje debe existir para que el gráfico tenga límites, pero lo hacemos invisible.**
                    display: true, // El eje existe
                    ticks: {
                       stepSize: 1, // Asegura que la escala sea de 1 en 1 si los números son pequeños
                       // Hacemos las etiquetas del eje invisibles
                       color: 'transparent' 
                    },
                    beginAtZero: true,
                    grid: {
                        // Ocultar las líneas de la rejilla para un look más limpio
                        display: false,
                        drawBorder: false // También ocultamos el borde del eje
                    }
                },
                y: {
                    ticks: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-primary') // Color de texto adaptable
                    }
                }
            },
            plugins: {
                legend: {
                    display: false // Oculta la leyenda 'Repeticiones', no es necesaria
                },
                // **CORRECCIÓN: Ajustes para mostrar el valor FUERA de la barra**
                datalabels: {
                    anchor: 'end', // Posiciona la etiqueta al final de la barra
                    align: 'end',  // Alinea el texto al final de la etiqueta (efectivamente, a la derecha de la barra)
                    padding: {
                        left: 8 // Espacio entre el final de la barra y el número
                    },
                    // Usamos el color de texto secundario del tema para que se vea bien en claro/oscuro
                    color: getComputedStyle(document.body).getPropertyValue('--text-secondary'),
                    font: {
                        weight: '600'
                    },
                    formatter: (value) => {
                        return value; // Muestra el valor numérico de la repetición
                    }
                },
                // **NUEVO: Configuración para mejorar el tooltip al pasar el ratón**
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${context.raw} ${context.raw === 1 ? 'vez' : 'veces'}`
                    }
                }
            }
        }
    });
}