/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// ⚠️  Replace with your Firebase project's web config
firebase.initializeApp({
    apiKey: "YOUR_API_KEY",
    authDomain: "alivepost.firebaseapp.com",
    projectId: "alivepost",
    storageBucket: "alivepost.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
});

const messaging = firebase.messaging();

// Background message handler (when tab is not focused)
messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Background message:", payload);

    const title = payload.notification?.title || "Alivepost";
    const options = {
        body: payload.notification?.body || "",
        icon: "https://cdn-icons-png.flaticon.com/512/2966/2966327.png",
        badge: "https://cdn-icons-png.flaticon.com/512/2966/2966327.png",
        data: payload.data,
    };

    self.registration.showNotification(title, options);
});
