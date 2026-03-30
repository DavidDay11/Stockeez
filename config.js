// ========================================
// CONFIGURACIÓN DE FIREBASE
// ========================================
// 
// IMPORTANTE: Este archivo NO debe subirse a repositorios públicos (GitHub, etc.)
// Agrégalo a .gitignore si usas control de versiones
//
// ========================================

// FIREBASE - Para sincronización de datos
const firebaseConfig = {
    // REEMPLAZA ESTOS VALORES con tu configuración de Firebase
    // Para obtenerla, sigue las instrucciones en INSTRUCCIONES-FIREBASE.md
    
  apiKey: "AIzaSyC7Iqv7Nndn8AnzRosOaWVxPyTEPrCopE8",
  authDomain: "stockeez-5884a.firebaseapp.com",
  databaseURL: "https://stockeez-5884a-default-rtdb.firebaseio.com",
  projectId: "stockeez-5884a",
  storageBucket: "stockeez-5884a.firebasestorage.app",
  messagingSenderId: "731599293963",
  appId: "1:731599293963:web:4a71b0d321a771b855c10e",
  measurementId: "G-58QZNWN7TN"
};


// NO MODIFIQUES NADA DEBAJO DE ESTA LÍNEA
// ========================================

// Verificar si Firebase está configurado
const isFirebaseConfigured = firebaseConfig.apiKey !== "AIzaSyC7Iqv7Nndn8AnzRosOaWVxPyTEPrCopE8";

if (!isFirebaseConfigured) {
    console.warn(
        '⚠️ FIREBASE NO CONFIGURADO\n' +
        'La sincronización está deshabilitada.\n' +
        'Para habilitar la sincronización:\n' +
        '1. Lee INSTRUCCIONES-FIREBASE.md\n' +
        '2. Configura tu proyecto en Firebase\n' +
        '3. Actualiza config.js con tus credenciales\n\n' +
        'La app funciona perfectamente en modo local sin Firebase.'
    );
}


