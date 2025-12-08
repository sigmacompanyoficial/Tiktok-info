// Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

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
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');

// Añadir evento de 'submit' al formulario
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevenir que la página se recargue

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    errorMessage.textContent = ''; // Limpiar mensajes de error previos

    if (username === 'admin' && password === 'admin') {
        window.location.href = 'admin.html';
        return;
    }

    if (!username || !password) {
        errorMessage.textContent = 'Por favor, introduce usuario y contraseña.';
        return;
    }

    const dbRef = ref(database);

    try {
        // CAMBIO CLAVE: Busca la contraseña en el nuevo nodo 'credentials'
        const snapshot = await get(child(dbRef, `credentials/${username}`));

        if (snapshot.exists()) {
            // El usuario existe, ahora comprobamos la contraseña
            const storedPassword = snapshot.val().password;
            if (password === storedPassword) {
                // ¡Contraseña correcta!
                sessionStorage.setItem('username', username);
                window.location.href = 'chat.html';
            } else {
                // Contraseña incorrecta
                errorMessage.textContent = 'La contraseña es incorrecta.';
            }
        } else {
            // El usuario no existe (o no tiene credenciales en el nodo correcto)
            errorMessage.textContent = 'El usuario no existe.';
        }
    } catch (error) {
        console.error("Error al intentar iniciar sesión:", error);
        errorMessage.textContent = 'Error al conectar con la base de datos.';
    }
});