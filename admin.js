// Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, get, set, child } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

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
