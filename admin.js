// Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, get, set, child, remove, update } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// La configuración de tu app web de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyA-ODwm4wUWYsfbgtmy4jelIPlsZsCQ4Ck",
    authDomain: "sigma-xat2.firebaseapp.com",
    databaseURL: "https://sigma-xat2-default-rtdb.europe-west1.firebasedatabase.app", 
    projectId: "sigma-xat2",
    storageBucket: "sigma-xat2.firebasestorage.app",
    messagingSenderId: "419112986768",
    appId: "1:419112986768:web:e930c6c22445295b871015",
    measurementId: "G-98YHEDL7YT"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const dbRef = ref(database);

// --- Elementos del DOM ---
// Formulario de Creación
const createAccountForm = document.getElementById('create-account-form');
const newUsernameInput = document.getElementById('new-username');
const newPasswordInput = document.getElementById('new-password');
const statusMessage = document.getElementById('status-message');

// Gestión de Mensajes
const messageCountElement = document.getElementById('message-count');
const deleteAllMessagesBtn = document.getElementById('delete-all-messages-btn');

// Gestión de Usuarios
const usersTableBody = document.getElementById('users-table-body');

// Modal de Edición
const editModal = document.getElementById('edit-modal');
const closeModalBtn = document.querySelector('.close-btn');
const modalUsernameDisplay = document.getElementById('modal-username-display');
const modalNewUsernameInput = document.getElementById('modal-new-username');
const modalNewPasswordInput = document.getElementById('modal-new-password');
const saveUserChangesBtn = document.getElementById('save-user-changes-btn');
const modalStatus = document.getElementById('modal-status');

// Variable para almacenar el nombre de usuario original que se está editando
let editingUsername = null;

// --- Funciones de Utilidad ---

function setStatus(element, message, type) {
    element.textContent = message;
    element.className = 'status';
    if (type) {
        element.classList.add(type); // 'success' o 'error'
    }
}

// --- Lógica Principal de Inicialización ---

document.addEventListener('DOMContentLoaded', () => {
    loadMessageCount();
    loadUsers();
});

// --- 1. Lógica de Creación de Cuenta (Existente) ---

createAccountForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newUsername = newUsernameInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    
    setStatus(statusMessage, '', null);

    if (!newUsername || !newPassword) {
        setStatus(statusMessage, 'Ambos campos son obligatorios.', 'error');
        return;
    }

    try {
        // 1. Comprobar si las credenciales ya existen en el nodo /credentials
        const credentialsSnapshot = await get(child(dbRef, `credentials/${newUsername}`));
        if (credentialsSnapshot.exists()) {
            setStatus(statusMessage, `El usuario "${newUsername}" ya tiene una cuenta.`, 'error');
            return;
        }

        // 2. Si no existe, crear la credencial en el nodo /credentials
        const newCredentialRef = ref(database, 'credentials/' + newUsername);
        await set(newCredentialRef, {
            password: newPassword
        });
        
        setStatus(statusMessage, `¡Cuenta para "${newUsername}" creada exitosamente!`, 'success');
        
        // Limpiar el formulario
        newUsernameInput.value = '';
        newPasswordInput.value = '';

        // Recargar la lista de usuarios
        loadUsers();

    } catch (error) {
        console.error("Error al crear la cuenta:", error);
        setStatus(statusMessage, 'Error al conectar con la base de datos.', 'error');
    }
});


// --- 2. Lógica de Gestión de Mensajes ---

async function loadMessageCount() {
    try {
        const messagesSnapshot = await get(child(dbRef, 'messages'));
        const count = messagesSnapshot.exists() ? Object.keys(messagesSnapshot.val()).length : 0;
        
        messageCountElement.textContent = `Número de mensajes enviados: ${count}`;
        
        if (count > 0) {
            deleteAllMessagesBtn.disabled = false;
        } else {
            deleteAllMessagesBtn.disabled = true;
        }

    } catch (error) {
        console.error("Error al cargar el conteo de mensajes:", error);
        messageCountElement.textContent = 'Error al cargar el conteo.';
        deleteAllMessagesBtn.disabled = true;
    }
}

deleteAllMessagesBtn.addEventListener('click', async () => {
    if (!confirm('¿Está seguro de que desea borrar TODOS los mensajes? Esta acción es irreversible.')) {
        return;
    }

    try {
        // Borra el nodo /messages completo
        await remove(child(dbRef, 'messages'));
        
        alert('Todos los mensajes han sido borrados exitosamente.');
        loadMessageCount(); // Recargar el conteo
    } catch (error) {
        console.error("Error al borrar mensajes:", error);
        alert('Error al borrar los mensajes de la base de datos.');
    }
});


// --- 3. Lógica de Listado de Usuarios ---

async function loadUsers() {
    usersTableBody.innerHTML = '<tr><td colspan="2">Cargando usuarios...</td></tr>';
    try {
        const credentialsSnapshot = await get(child(dbRef, 'credentials'));

        if (!credentialsSnapshot.exists()) {
            usersTableBody.innerHTML = '<tr><td colspan="2">No hay usuarios registrados.</td></tr>';
            return;
        }

        const credentials = credentialsSnapshot.val();
        let html = '';
        
        // El bucle for...in es adecuado para objetos de Firebase donde las claves son los usernames
        for (const username in credentials) {
            html += `
                <tr data-username="${username}">
                    <td>${username}</td>
                    <td class="action-buttons">
                        <button class="edit-btn" data-username="${username}">Editar</button>
                        <button class="delete-user-btn" data-username="${username}">Borrar</button>
                    </td>
                </tr>
            `;
        }

        usersTableBody.innerHTML = html;
        
        // Añadir listeners a los botones de la tabla
        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', openEditModal);
        });
        document.querySelectorAll('.delete-user-btn').forEach(button => {
            button.addEventListener('click', deleteUser);
        });

    } catch (error) {
        console.error("Error al cargar usuarios:", error);
        usersTableBody.innerHTML = '<tr><td colspan="2" class="status error">Error al cargar usuarios.</td></tr>';
    }
}


// --- 4. Lógica de Edición y Borrado de Usuario ---

function openEditModal(e) {
    editingUsername = e.target.dataset.username;
    
    modalUsernameDisplay.textContent = editingUsername;
    modalNewPasswordInput.value = '';
    modalNewUsernameInput.value = '';
    setStatus(modalStatus, '', null);
    
    editModal.style.display = 'block';
}

closeModalBtn.addEventListener('click', () => {
    editModal.style.display = 'none';
    editingUsername = null;
});

// Cerrar el modal haciendo clic fuera de él
window.addEventListener('click', (event) => {
    if (event.target == editModal) {
        editModal.style.display = 'none';
        editingUsername = null;
    }
});

saveUserChangesBtn.addEventListener('click', async () => {
    const newPassword = modalNewPasswordInput.value.trim();
    const newUsername = modalNewUsernameInput.value.trim();
    
    setStatus(modalStatus, '', null);

    if (!editingUsername) {
        setStatus(modalStatus, 'Error: No hay usuario seleccionado para editar.', 'error');
        return;
    }

    if (!newPassword && !newUsername) {
        setStatus(modalStatus, 'No hay cambios para guardar.', 'error');
        return;
    }

    try {
        if (newUsername && newUsername !== editingUsername) {
            // Cambio de nombre de usuario: requiere mover el nodo completo

            // 1. Verificar si el nuevo nombre de usuario ya existe
            const newUsernameSnapshot = await get(child(dbRef, `credentials/${newUsername}`));
            if (newUsernameSnapshot.exists()) {
                setStatus(modalStatus, `El nuevo usuario "${newUsername}" ya existe.`, 'error');
                return;
            }

            // 2. Obtener la credencial actual
            const currentCredentialSnapshot = await get(child(dbRef, `credentials/${editingUsername}`));
            const currentData = currentCredentialSnapshot.val();
            
            // 3. Crear el nuevo nodo en /credentials
            const newCredentialRef = ref(database, 'credentials/' + newUsername);
            await set(newCredentialRef, {
                password: newPassword || currentData.password // Usar la nueva o la actual
            });

            // 4. Borrar el nodo antiguo de /credentials
            await remove(child(dbRef, `credentials/${editingUsername}`));
            
            
            // <<<< CORRECCIÓN: SINCRONIZACIÓN DE USUARIOS EN /users >>>>
            // 5. Obtener los datos de presencia/estado del usuario antiguo en /users
            const currentUserSnapshot = await get(child(dbRef, `users/${editingUsername}`));
            
            if (currentUserSnapshot.exists()) {
                const userData = currentUserSnapshot.val();
                
                // 6. Crear el nuevo nodo en /users con los datos antiguos
                const newUserRef = ref(database, 'users/' + newUsername);
                await set(newUserRef, userData);
                
                // 7. Borrar el nodo antiguo en /users
                await remove(child(dbRef, `users/${editingUsername}`));
            }
            // <<<< FIN DE CORRECCIÓN >>>>

            // 8. Actualizar la variable de edición
            editingUsername = newUsername;

            setStatus(modalStatus, `Usuario y contraseña cambiados para "${newUsername}".`, 'success');

        } else if (newPassword) {
            // Solo cambio de contraseña (o el nombre de usuario es el mismo)
            await update(child(dbRef, `credentials/${editingUsername}`), {
                password: newPassword
            });
            setStatus(modalStatus, `Contraseña cambiada para "${editingUsername}".`, 'success');
        }
        
        // Si todo va bien, cerrar y recargar
        // Si solo se cambió la contraseña, el nombre de usuario de la tabla no cambia.
        // Si se cambió el nombre, el nuevo nombre ya está en editingUsername.
        if (!newUsername || newUsername === editingUsername) {
            setTimeout(() => {
                editModal.style.display = 'none';
                loadUsers();
                editingUsername = null;
            }, 1000); // Esperar un segundo para que el usuario vea el mensaje
        } else {
             // Si el nombre de usuario cambió, la recarga ya se manejó arriba.
             setTimeout(() => {
                editModal.style.display = 'none';
                loadUsers();
                editingUsername = null;
            }, 1000);
        }

    } catch (error) {
        console.error("Error al guardar cambios de usuario:", error);
        setStatus(modalStatus, 'Error al guardar los cambios en la base de datos.', 'error');
    }
});


async function deleteUser(e) {
    const usernameToDelete = e.target.dataset.username;

    if (!confirm(`¿Está seguro de que desea borrar la cuenta de "${usernameToDelete}"? Esta acción es irreversible.`)) {
        return;
    }

    try {
        // Borrar credencial
        await remove(child(dbRef, `credentials/${usernameToDelete}`));
        
        // Borrar nodo de presencia en /users
        await remove(child(dbRef, `users/${usernameToDelete}`));
        
        alert(`Cuenta de "${usernameToDelete}" borrada exitosamente.`);
        loadUsers(); // Recargar la lista
    } catch (error) {
        console.error("Error al borrar usuario:", error);
        alert('Error al borrar la cuenta de la base de datos.');
    }
}