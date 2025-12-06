// Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, get, set, child } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// La configuración de tu app web de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCb_S9CK0_DdfBhQCocYxHDajUI4XigVRU",
    authDomain: "sigma-xat-72e47.firebaseapp.com",
    databaseURL: "https://sigma-xat-72e47-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "sigma-xat-72e47",
    storageBucket: "sigma-xat-72e47.firebasestorage.app",
    messagingSenderId: "938349819018",
    appId: "1:938349819018:web:157a24946dfa7627f62973",
    measurementId: "G-FBPS4KHTSH"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Obtener elementos del DOM
const createAccountForm = document.getElementById('create-account-form');
const newUsernameInput = document.getElementById('new-username');
const newPasswordInput = document.getElementById('new-password');
const statusMessage = document.getElementById('status-message');

createAccountForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newUsername = newUsernameInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    
    statusMessage.textContent = '';
    statusMessage.className = 'status';

    if (!newUsername || !newPassword) {
        statusMessage.textContent = 'Ambos campos son obligatorios.';
        statusMessage.classList.add('error');
        return;
    }

    const dbRef = ref(database);

    try {
        // 1. Comprobar si el usuario ya existe
        const userSnapshot = await get(child(dbRef, `users/${newUsername}`));
        if (userSnapshot.exists()) {
            statusMessage.textContent = `El usuario "${newUsername}" ya existe.`;
            statusMessage.classList.add('error');
            return;
        }

        // 2. Si no existe, crearlo
        const newUserRef = ref(database, 'users/' + newUsername);
        await set(newUserRef, {
            password: newPassword
        });
        
        statusMessage.textContent = `¡Cuenta para "${newUsername}" creada exitosamente!`;
        statusMessage.classList.add('success');
        
        // Limpiar el formulario
        newUsernameInput.value = '';
        newPasswordInput.value = '';

    } catch (error) {
        console.error("Error al crear la cuenta:", error);
        statusMessage.textContent = 'Error al conectar con la base de datos.';
        statusMessage.classList.add('error');
    }
});
