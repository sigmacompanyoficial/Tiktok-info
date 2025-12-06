// --- 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    onChildAdded, 
    onChildChanged, 
    onChildRemoved,
    push, 
    serverTimestamp, 
    set,
    remove,
    get,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// ⚠️ IMPORTANTE: REEMPLAZA ESTOS VALORES CON TU CONFIGURACIÓN DE FIREBASE REAL
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

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const messagesRef = ref(database, 'messages');
const lastActivityRef = ref(database, 'lastActivity');
const MAX_MESSAGES = 20; // Límite de mensajes
const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 horas

// Referencias a elementos del DOM
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');
const sendButton = document.getElementById('send-button');
const homeButton = document.getElementById('home-button');
const emojiButton = document.getElementById('emoji-button');
const replyPreview = document.getElementById('reply-preview');
const cancelReplyButton = document.getElementById('cancel-reply');
const emojiPickerContainer = document.getElementById('emoji-picker-container'); 
const logoutButton = document.getElementById('logout-button');

let currentUser = sessionStorage.getItem('username');
let replyTo = null;

// Variables para manejo de la pulsación larga (long press)
let longPressTimer;
const LONG_PRESS_DURATION = 500; // 500 milisegundos

// --- 2. GESTIÓN DE AUTENTICACIÓN Y MANTENIMIENTO ---

if (!currentUser) {
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


/**
 * 🕒 Limpieza por inactividad de 24 horas.
 */
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

/**
 * 🗑️ Mantiene solo los últimos 20 mensajes. 
 */
function trimMessages() {
    get(messagesRef).then((snapshot) => {
        if (!snapshot.exists()) return; 

        // Solución robusta para contar hijos
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


// --- 3. GESTIÓN DE LA BARRA DE ENTRADA Y EMOJIS ---

/**
 * Configura el selector de emojis.
 */
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
            // Cierra las acciones de mensaje si están abiertas
            closeAllTouchActions(); 
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
            
            set(lastActivityRef, Date.now()); 
            trimMessages(); 
            
            cancelReply();
            emojiPickerContainer.style.display = 'none'; 
        })
        .catch(error => console.error("Error al enviar mensaje:", error));
});

cancelReplyButton.addEventListener('click', cancelReply);

function cancelReply() {
    replyTo = null;
    replyPreview.style.display = 'none';
}


// --- 4. GESTIÓN DE MENSAJES EN TIEMPO REAL (VISTO) ---

onChildAdded(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const message = snapshot.val();
    if (document.getElementById(messageId)) return;

    // MARCAR COMO VISTO
    if (message.sender !== currentUser && !message.read) {
         setTimeout(() => {
             set(ref(database, `messages/${messageId}/read`), true);
         }, 1000); 
    }
    
    const isScrolledToBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 1;
    if (message.timestamp) {
        displayMessage(messageId, message);
    } else {
        setTimeout(() => displayMessage(messageId, snapshot.val()), 500); 
    }
    if (isScrolledToBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});


onChildChanged(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const messageData = snapshot.val();
    const messageElement = document.getElementById(messageId);
    
    if (messageElement) {
        // Actualiza Reacciones
        const reactionsContainer = messageElement.querySelector('.reactions');
        if (reactionsContainer) {
            reactionsContainer.innerHTML = '';
            addReactions(reactionsContainer, messageId, messageData.reactions);
        }
        
        // Actualiza el estado de Visto (Doble Check Azul)
        if (messageData.read && messageData.sender === currentUser) {
            const checkIcon = messageElement.querySelector('.checkmark');
            if (checkIcon) {
                checkIcon.classList.add('read');
            }
        }
    }
});

onChildRemoved(messagesRef, (snapshot) => {
    const messageId = snapshot.key;
    const messageElement = document.getElementById(messageId);
    if (messageElement) {
        messageElement.remove();
    }
});

// --- 5. RENDERIZADO Y FUNCIONES AUXILIARES ---

function displayMessage(messageId, message) {
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
    
    // Vista previa de respuesta
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
        const readClass = message.read ? ' read' : '';
        checkIconHtml = `<i class="fas fa-check-double checkmark${readClass}"></i>`;
    }
    
    timestampSpan.innerHTML = formatTimestamp(message.timestamp) + checkIconHtml; 
    messageContentDiv.appendChild(timestampSpan);
    
    messageWrapper.appendChild(messageContentDiv);
    
    // Acciones (Responder/Reaccionar)
    const actionsDiv = createMessageActions(messageId, message);
    messageWrapper.appendChild(actionsDiv);
    
    // Reacciones mostradas
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = `reactions ${isSentByCurrentUser ? 'sent-reactions' : 'received-reactions'}`;
    addReactions(reactionsDiv, messageId, message.reactions);
    messageWrapper.appendChild(reactionsDiv);

    chatMessages.appendChild(messageWrapper);
    
    // Configurar Eventos Táctiles
    setupTouchActions(messageWrapper, actionsDiv);
    
    // Scroll al final
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * ⏰ Función corregida para el formato de hora.
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    // 🥳 CORRECCIÓN: Se elimina la doble llamada que causaba el error TypeError
    const minutes = date.getMinutes().toString().padStart(2, '0'); 
    return `${hours}:${minutes}`;
}

const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '🔥'];

function createMessageActions(messageId, message) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    // Botón de Responder
    const replyButton = document.createElement('button');
    replyButton.innerHTML = '<i class="fas fa-reply"></i>'; 
    replyButton.title = 'Responder';
    replyButton.onclick = () => {
        replyTo = { id: messageId, sender: message.sender, text: message.text };
        document.getElementById('reply-user').textContent = message.sender;
        document.getElementById('reply-text').textContent = message.text;
        replyPreview.style.display = 'flex';
        messageInput.focus();
        closeAllTouchActions(); 
    };
    actionsDiv.appendChild(replyButton);
    
    // Botón para mostrar el selector de reacciones
    const reactButton = document.createElement('button');
    reactButton.innerHTML = '<i class="far fa-smile-wink"></i>'; 
    reactButton.title = 'Reaccionar';
    actionsDiv.appendChild(reactButton);
    
    // Selector de reacciones flotante
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
            closeAllTouchActions();
        };
        reactionSelector.appendChild(btn);
    });
    
    // Toggle selector de reacciones
    reactButton.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.reaction-selector').forEach(sel => {
            if (sel !== reactionSelector) sel.style.display = 'none';
        });
        reactionSelector.style.display = reactionSelector.style.display === 'none' ? 'flex' : 'none';
    };
    
    // Cerrar el selector si se hace clic fuera
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

// -------------------------------------------------------------
// --- 6. GESTIÓN DE EVENTOS TÁCTILES (LONG PRESS) ---
// -------------------------------------------------------------

/**
 * 📱 Configura los eventos táctiles para mostrar las acciones de mensaje (Responder/Reaccionar).
 */
function setupTouchActions(messageWrapper, actionsDiv) {
    // Si no es un dispositivo táctil, salimos para no interferir con el hover
    if (!('ontouchstart' in window)) return;

    let isScrolling = false;
    let touchStartX = 0;
    let touchStartY = 0;

    // Prevenir que el toque inicie el scroll y permitir la detección de pulsación
    messageWrapper.addEventListener('touchstart', (e) => {
        // e.stopPropagation(); // Se puede comentar para permitir burbujeo si hay listeners parentales

        closeAllTouchActions(); 

        // Registra las coordenadas iniciales para detectar movimiento (scroll)
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isScrolling = false;

        // Inicia el temporizador
        longPressTimer = setTimeout(() => {
            if (!isScrolling) {
                actionsDiv.classList.add('active-touch');
            }
        }, LONG_PRESS_DURATION);
    }, { passive: true }); // Usamos { passive: true } para mejorar el rendimiento del scroll

    // Cancela el temporizador si el dedo se mueve significativamente (indicando scroll)
    messageWrapper.addEventListener('touchmove', (e) => {
        const moveX = e.touches[0].clientX;
        const moveY = e.touches[0].clientY;
        
        // Si hay un movimiento significativo, lo consideramos scroll
        const movementThreshold = 10; 
        if (Math.abs(moveX - touchStartX) > movementThreshold || Math.abs(moveY - touchStartY) > movementThreshold) {
            clearTimeout(longPressTimer);
            isScrolling = true;
        }
    }, { passive: true });


    messageWrapper.addEventListener('touchend', (e) => {
        // Cancela el temporizador si el toque se libera antes del tiempo límite
        clearTimeout(longPressTimer);
    });
    
    // Listener global para cerrar las acciones abiertas cuando se toca/clica fuera
    document.addEventListener('click', (e) => {
        // Cierra si el clic no es dentro de un mensaje ni dentro de las acciones abiertas
        if (!e.target.closest('.message') && !e.target.closest('.message-actions')) {
             closeAllTouchActions();
        }
    });
}

/**
 * Cierra todas las acciones de mensaje abiertas por evento táctil.
 */
function closeAllTouchActions() {
    document.querySelectorAll('.message-actions').forEach(actionsDiv => {
        actionsDiv.classList.remove('active-touch');
        
        // Cierra selectores de reacción que puedan estar flotando dentro de las acciones
        const reactionSelector = actionsDiv.querySelector('.reaction-selector');
        if (reactionSelector) {
            reactionSelector.style.display = 'none';
        }
    });
}