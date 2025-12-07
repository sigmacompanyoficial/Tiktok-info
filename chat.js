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
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCb_S9CK0_DdfBhQCocYxHDajUI4XigVRU",
    authDomain: "sigma-xat-72e47.firebaseapp.com",
    databaseURL: "https://sigma-xat-72e47-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "sigma-xat-72e47",
    storageBucket: "sigma-xat-72e47.appspot.com",
    messagingSenderId: "938349819018",
    appId: "1:938349819018:web:157a24946dfa7627f62973",
    measurementId: "G-FBPS4KHTSH"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const messagesRef = ref(database, 'messages');
const lastActivityRef = ref(database, 'lastActivity');
const typingRef = ref(database, 'typing');
const MAX_MESSAGES = 20;
const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000;

// Referencias a elementos del DOM
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');
const sendButton = document.getElementById('send-button');
const homeButton = document.getElementById('home-button');
const clearAllButton = document.getElementById('clear-all-button');
const emojiButton = document.getElementById('emoji-button');
const replyPreview = document.getElementById('reply-preview');
const cancelReplyButton = document.getElementById('cancel-reply');
const emojiPickerContainer = document.getElementById('emoji-picker-container'); 
const logoutButton = document.getElementById('logout-button');
const typingIndicator = document.getElementById('typing-indicator');

// Verificar que todos los elementos existen
if (!messageForm || !messageInput || !chatMessages || !typingIndicator || !clearAllButton) {
    console.error('Error: Faltan elementos del DOM necesarios');
}

let currentUser = sessionStorage.getItem('username');
let replyTo = null;
let typingTimeout = null;
let seenIntervals = {};

// --- 2. GESTIÓN DE AUTENTICACIÓN ---

if (!currentUser) {
    // Si no hay usuario, redirigir al login
    window.location.href = 'login.html'; 
} else {
    document.getElementById('username-display').textContent = currentUser;
}

logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem('username');
    window.location.href = 'login.html'; 
});

homeButton.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// --- 3. NOTIFICACIONES DEL NAVEGADOR ---

async function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            console.log('Permiso de notificaciones:', permission);
            return permission === 'granted';
        }
        console.log('Permiso de notificaciones actual:', Notification.permission);
        return Notification.permission === 'granted';
    }
    console.log('Las notificaciones no están soportadas en este navegador');
    return false;
}

function showNotification(title, body, icon = '🎁') {
    console.log('Intentando mostrar notificación:', { title, body, permission: Notification.permission });
    
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const notification = new Notification(title, {
                body: body,
                icon: 'https://img.icons8.com/color/96/tiktok--v1.png',
                badge: 'https://img.icons8.com/color/96/tiktok--v1.png',
                tag: 'chat-message',
                requireInteraction: false,
                silent: false,
                vibrate: [200, 100, 200]
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            setTimeout(() => notification.close(), 5000);
            console.log('Notificación mostrada correctamente');
        } catch (error) {
            console.error('Error al mostrar notificación:', error);
        }
    } else {
        console.log('No se puede mostrar la notificación. Permiso:', Notification.permission);
    }
}

// Solicitar permiso al cargar SIN notificación de prueba
requestNotificationPermission().then(granted => {
    if (granted) {
        console.log('✅ Permisos de notificación concedidos');
    } else {
        console.log('❌ Permisos de notificación denegados o no disponibles');
    }
});

// --- 4. INDICADOR DE "ESTÁ ESCRIBIENDO" ---

function updateTypingStatus(isTyping) {
    const userTypingRef = ref(database, `typing/${currentUser}`);
    if (isTyping) {
        set(userTypingRef, {
            username: currentUser,
            timestamp: Date.now()
        });
    } else {
        remove(userTypingRef);
    }
}

messageInput.addEventListener('input', () => {
    clearTimeout(typingTimeout);
    updateTypingStatus(true);
    
    typingTimeout = setTimeout(() => {
        updateTypingStatus(false);
    }, 2000);
});

messageInput.addEventListener('blur', () => {
    clearTimeout(typingTimeout);
});

onValue(typingRef, (snapshot) => {
    if (!typingIndicator) return;
    
    const typingUsers = [];
    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            if (data.username !== currentUser) {
                const timeSinceTyping = Date.now() - data.timestamp;
                if (timeSinceTyping < 3000) {
                    typingUsers.push(data.username);
                }
            }
        });
    }
    
    if (typingUsers.length > 0) {
        const userName = typingUsers[0]; // Usamos el primer usuario
        const initial = userName.charAt(0).toUpperCase();
        
        // Limpiar contenido anterior
        typingIndicator.innerHTML = '';
        
        // Crear avatar con inicial
        const avatar = document.createElement('div');
        avatar.className = 'typing-avatar';
        avatar.textContent = initial;
        
        // Crear la burbuja de mensaje
        const bubble = document.createElement('div');
        bubble.className = 'typing-bubble';
        
        // Crear los 3 puntitos dentro de la burbuja
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'typing-dots-bubble';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'typing-dot';
            dotsContainer.appendChild(dot);
        }
        
        bubble.appendChild(dotsContainer);
        
        // Agregar todo al indicador
        typingIndicator.appendChild(avatar);
        typingIndicator.appendChild(bubble);
        
        typingIndicator.style.display = 'flex';
        
        console.log('Indicador de escritura mostrado para:', userName);
    } else {
        typingIndicator.style.display = 'none';
        typingIndicator.innerHTML = '';
    }
});

// --- 5. BOTÓN ELIMINAR TODOS LOS MENSAJES ---

if (clearAllButton) {
    clearAllButton.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres eliminar todos los mensajes? Esta acción no se puede deshacer.')) {
            remove(messagesRef)
                .then(() => {
                    console.log('Todos los mensajes han sido eliminados');
                    if (chatMessages) {
                        chatMessages.innerHTML = '';
                    }
                    Object.keys(seenIntervals).forEach(key => {
                        clearInterval(seenIntervals[key]);
                    });
                    seenIntervals = {};
                })
                .catch(error => console.error('Error al eliminar mensajes:', error));
        }
    });
}

// --- 6. MANTENIMIENTO DEL CHAT ---

const checkChatActivity = () => {
    get(lastActivityRef).then((snapshot) => {
        if (snapshot.exists()) {
            const lastActivityTimestamp = snapshot.val();
            const now = Date.now();
            if (now - lastActivityTimestamp > INACTIVITY_LIMIT_MS) {
                remove(messagesRef);
                remove(lastActivityRef);
                console.log("Chat limpiado por inactividad de 24 horas.");
            }
        }
    });
};
checkChatActivity(); 

function trimMessages() {
    get(messagesRef).then((snapshot) => {
        if (!snapshot.exists()) return; 

        const total = snapshot.numChildren ? snapshot.numChildren() : Object.keys(snapshot.val() || {}).length;

        if (total > MAX_MESSAGES) {
            const children = [];
            snapshot.forEach(childSnapshot => children.push(childSnapshot));
            
            children.sort((a, b) => {
                const timeA = a.val().timestamp || 0;
                const timeB = b.val().timestamp || 0;
                return timeA - timeB;
            });
            
            const itemsToDelete = total - MAX_MESSAGES;
            
            for (let i = 0; i < itemsToDelete; i++) {
                if (children[i] && children[i].ref) {
                    remove(children[i].ref);
                }
            }
            console.log(`Eliminados ${itemsToDelete} mensajes antiguos.`);
        }
    }).catch(error => console.error("Error al obtener snapshot para trimMessages:", error));
}

// --- 7. SELECTOR DE EMOJIS ---

function setupEmojiPicker() {
    if (customElements.get('emoji-picker')) { 
        const picker = document.createElement('emoji-picker');
        emojiPickerContainer.appendChild(picker);

        emojiPickerContainer.style.display = 'none';

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
            emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
        });
        
        document.addEventListener('click', (e) => {
            if (!emojiPickerContainer.contains(e.target) && !emojiButton.contains(e.target)) {
                emojiPickerContainer.style.display = 'none';
            }
        });
    }
}
setupEmojiPicker();

// --- 8. ENVÍO DE MENSAJES ---

if (messageForm && messageInput) {
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        
        if (messageText === '') return; 

        const newMessage = {
            sender: currentUser,
            text: messageText,
            timestamp: serverTimestamp(),
            read: false, 
            reactions: {},
        };

        if (replyTo) {
            newMessage.replyTo = replyTo;
        }

        push(messagesRef, newMessage)
            .then(() => {
                messageInput.value = '';
                updateTypingStatus(false);
                clearTimeout(typingTimeout);
                
                set(lastActivityRef, Date.now()); 
                trimMessages(); 
                
                cancelReply();
                if (emojiPickerContainer) {
                    emojiPickerContainer.style.display = 'none';
                }
            })
            .catch(error => console.error("Error al enviar mensaje:", error));
    });
}

if (cancelReplyButton) {
    cancelReplyButton.addEventListener('click', cancelReply);
}

function cancelReply() {
    replyTo = null;
    if (replyPreview) {
        replyPreview.style.display = 'none';
    }
}

// --- 9. GESTIÓN DE MENSAJES EN TIEMPO REAL ---

onChildAdded(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const message = snapshot.val();
    
    // Evitar doble renderizado si el elemento ya está en el DOM
    if (document.getElementById(messageId)) return;

    // NOTIFICACIÓN si el mensaje NO es del usuario actual
    if (message.sender !== currentUser && message.text) {
        console.log('Nuevo mensaje recibido de:', message.sender);
        
        // Mostrar notificación SIEMPRE
        showNotification(
            'Soporte de TikTok',
            'Hay un nuevo regalo',
            '🎁'
        );
    }

    // MARCAR COMO VISTO con timestamp (SOLO si es recibido y no ha sido leído)
    if (message.sender !== currentUser && !message.read) {
         setTimeout(() => {
             set(ref(database, `messages/${messageId}/read`), true);
             set(ref(database, `messages/${messageId}/readAt`), Date.now());
         }, 1000); 
    }
    
    const isScrolledToBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 1;
    
    // Llama a la función de renderizado inmediatamente para mostrar el mensaje
    renderAndAppendMessage(messageId, message);

    if (!message.timestamp) {
        // Mecanismo de respaldo: esperar a que el servidor escriba el timestamp
        setTimeout(() => {
            get(snapshot.ref).then(newSnapshot => {
                if (newSnapshot.exists()) {
                    // El mensaje ya está en el DOM.
                }
            });
        }, 500); 
    }
    
    if (isScrolledToBottom && chatMessages) {
        // Esto asegura que se haga scroll si estábamos al final
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

// CORRECCIÓN: Manejo de actualización de mensajes para evitar bugs al editar en la DB
onChildChanged(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const messageData = snapshot.val();
    const oldMessageElement = document.getElementById(messageId);
    
    if (oldMessageElement) {
        // 1. Obtener referencias
        const parent = oldMessageElement.parentElement;
        const nextSibling = oldMessageElement.nextSibling;

        // 2. Eliminar el elemento antiguo (soluciona el bug visual)
        oldMessageElement.remove();
        
        // 3. Crear el nuevo elemento con los datos actualizados
        const newMessageWrapper = createMessageElement(messageId, messageData);
        
        // 4. Re-insertar el nuevo elemento en la posición original
        if (nextSibling) {
            parent.insertBefore(newMessageWrapper, nextSibling);
        } else {
            parent.appendChild(newMessageWrapper);
        }
        
        // 5. Reconfigurar las acciones
        const actionsDiv = newMessageWrapper.querySelector('.message-actions');
        if (actionsDiv) {
             setupTouchAction(newMessageWrapper, actionsDiv);
        }
    }
});

onChildRemoved(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const messageElement = document.getElementById(messageId);
    if (messageElement) {
        messageElement.remove();
    }
    if (seenIntervals[messageId]) {
        clearInterval(seenIntervals[messageId]);
        delete seenIntervals[messageId];
    }
});

// --- 10. FUNCIONES DE TIEMPO ---

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) {
        return 'justo ahora';
    } else if (minutes < 60) {
        return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    } else if (hours < 24) {
        return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    } else {
        return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
    }
}

function updateSeenIndicator(messageElement, readAt, messageId) {
    if (!readAt) {
        // Asegurar que se elimina el indicador si readAt es null/false
        const existingSeenIndicator = messageElement.querySelector('.seen-indicator');
        if (existingSeenIndicator) {
             existingSeenIndicator.remove();
        }
        if (seenIntervals[messageId]) {
            clearInterval(seenIntervals[messageId]);
            delete seenIntervals[messageId];
        }
        return;
    }
    
    let seenIndicator = messageElement.querySelector('.seen-indicator');
    
    if (!seenIndicator) {
        seenIndicator = document.createElement('div');
        seenIndicator.className = 'seen-indicator';
        messageElement.appendChild(seenIndicator);
        
        // Si ya hay un intervalo, lo limpiamos antes de crear uno nuevo.
        if (seenIntervals[messageId]) {
            clearInterval(seenIntervals[messageId]);
        }
        
        // Actualizar cada minuto
        seenIntervals[messageId] = setInterval(() => {
            const currentElement = document.getElementById(messageId);
            if (currentElement) {
                // Re-obtener el indicador por si fue recreado o movido
                const indicator = currentElement.querySelector('.seen-indicator');
                if (indicator) {
                    indicator.innerHTML = `<i class="fas fa-eye"></i> Visto ${getTimeAgo(readAt)}`;
                }
            } else {
                clearInterval(seenIntervals[messageId]);
                delete seenIntervals[messageId];
            }
        }, 60000);
    }
    
    seenIndicator.innerHTML = `<i class="fas fa-eye"></i> Visto ${getTimeAgo(readAt)}`;
}

// --- 11. RENDERIZADO DE MENSAJES (Refactorizado para ser reutilizable) ---

function createMessageElement(messageId, message) {
    const isSentByCurrentUser = message.sender === currentUser;
    
    const messageWrapper = document.createElement('div');
    messageWrapper.id = messageId;
    messageWrapper.className = `message ${isSentByCurrentUser ? 'sent' : 'received'}`;
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
        quoteDiv.className = 'reply-quote';
        const quoteUser = document.createElement('strong');
        quoteUser.textContent = message.replyTo.sender;
        const quoteText = document.createElement('p');
        quoteText.textContent = message.replyTo.text.length > 50 ? message.replyTo.text.substring(0, 50) + '...' : message.replyTo.text;
        quoteDiv.appendChild(quoteUser);
        quoteDiv.appendChild(quoteText);
        messageContentDiv.appendChild(quoteDiv);
    }

    const messageBodyDiv = document.createElement('div');
    messageBodyDiv.className = 'message-body';
    const textP = document.createElement('p');
    textP.textContent = message.text;
    messageBodyDiv.appendChild(textP);
    messageContentDiv.appendChild(messageBodyDiv);

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'message-timestamp';
    
    let checkIconHtml = '';
    if (isSentByCurrentUser) {
        // La clase 'read' se añade al checkmark cuando onChildChanged detecta la lectura
        const readClass = message.read ? ' read' : ''; 
        checkIconHtml = `<i class="fas fa-check-double checkmark${readClass}"></i>`;
    }
    
    timestampSpan.innerHTML = formatTimestamp(message.timestamp) + checkIconHtml; 
    messageContentDiv.appendChild(timestampSpan);
    
    messageWrapper.appendChild(messageContentDiv);
    
    const actionsDiv = createMessageActions(messageId, message);
    messageWrapper.appendChild(actionsDiv);
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = `reactions ${isSentByCurrentUser ? 'sent-reactions' : 'received-reactions'}`;
    addReactions(reactionsDiv, messageId, message.reactions);
    messageWrapper.appendChild(reactionsDiv);

    // Agregar indicador de "Visto" si el mensaje fue leído (Solo para mensajes enviados por el usuario actual)
    if (isSentByCurrentUser && message.read && message.readAt) {
        updateSeenIndicator(messageWrapper, message.readAt, messageId);
    }
    
    return messageWrapper;
}

function renderAndAppendMessage(messageId, message) {
    const messageWrapper = createMessageElement(messageId, message);
    chatMessages.appendChild(messageWrapper);
    
    const actionsDiv = messageWrapper.querySelector('.message-actions');
    setupTouchAction(messageWrapper, actionsDiv);
}


function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0'); 
    return `${hours}:${minutes}`;
}

const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '🔥'];

function createMessageActions(messageId, message) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    const replyButton = document.createElement('button');
    replyButton.innerHTML = '<i class="fas fa-reply"></i>'; 
    replyButton.title = 'Responder';
    replyButton.onclick = () => {
        replyTo = { id: messageId, sender: message.sender, text: message.text };
        const replyUser = document.getElementById('reply-user');
        const replyText = document.getElementById('reply-text');
        if (replyUser && replyText && replyPreview) {
            replyUser.textContent = message.sender;
            // Asegurar que el texto de la respuesta sea legible en la previsualización
            replyText.textContent = message.text.length > 50 ? message.text.substring(0, 50) + '...' : message.text;
            replyPreview.style.display = 'flex';
        }
        if (messageInput) {
            messageInput.focus();
        }
        closeAllMessageActions(); 
    };
    actionsDiv.appendChild(replyButton);
    
    const reactButton = document.createElement('button');
    reactButton.innerHTML = '<i class="far fa-smile-wink"></i>'; 
    reactButton.title = 'Reaccionar';
    actionsDiv.appendChild(reactButton);
    
    const reactionSelector = document.createElement('div');
    reactionSelector.className = 'reaction-selector';
    reactionSelector.style.display = 'none'; 
    
    AVAILABLE_REACTIONS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.className = 'reaction-option';
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
    for (const userId in reactions) {
        const emoji = reactions[userId];
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
    }
    
    for (const emoji in reactionCounts) {
        const count = reactionCounts[emoji];
        const reactionSpan = document.createElement('span');
        reactionSpan.className = 'reaction';
        reactionSpan.textContent = `${emoji} ${count}`;
        reactionSpan.onclick = () => toggleReaction(messageId, emoji);
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

// --- 12. EVENTOS TÁCTILES ---

function setupTouchAction(messageWrapper, actionsDiv) {
    let touchExecuted = false; 

    const handleAction = (e) => {
        if (e.target.closest('.message-actions')) {
            return;
        }

        closeAllMessageActions(actionsDiv);
        
        // El comportamiento touch se maneja con la clase 'active-touch' en CSS para un mejor UX
        actionsDiv.classList.toggle('active-touch');
        e.stopPropagation(); 
    };

    messageWrapper.addEventListener('touchstart', (e) => {
        touchExecuted = true;
        // Pequeño retraso para permitir que se ejecuten los clics normales sin interferencia
        setTimeout(() => {
            handleAction(e);
        }, 100); 
    }, { passive: true });
    
    messageWrapper.addEventListener('click', (e) => {
        if (touchExecuted) {
            touchExecuted = false; 
            return;
        }
        handleAction(e);
    });

    document.addEventListener('click', (e) => {
        // Cierra las acciones si se hace clic fuera del mensaje o las acciones
        if (!e.target.closest('.message') && !e.target.closest('.message-actions')) {
             closeAllMessageActions();
        }
    });

    chatMessages.addEventListener('scroll', closeAllMessageActions, { passive: true });
}

function closeAllMessageActions(excludeActionsDiv = null) {
    document.querySelectorAll('.message-actions').forEach(actionsDiv => {
        if (actionsDiv !== excludeActionsDiv) {
            actionsDiv.classList.remove('active-touch');
            
            const reactionSelector = actionsDiv.querySelector('.reaction-selector');
            if (reactionSelector) {
                reactionSelector.style.display = 'none';
            }
        }
    });
}