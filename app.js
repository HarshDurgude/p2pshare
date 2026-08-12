


// ============================================================
// FIREBASE IMPORTS
// ============================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    set,
    get,
    onValue,
    onDisconnect,
    remove,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";


// ============================================================
// FIREBASE CONFIG
// ============================================================
//
// Keep the values from your Firebase project.
// The databaseURL below is important because your database
// is located in asia-southeast1.
//


const firebaseConfig = {
    apiKey: "AIzaSyBLXv-LsCbvbWeQUnuRvHOKRzdUOPEiqkU",
    authDomain: "p2p-text-share.firebaseapp.com",
    projectId: "p2p-text-share",
    storageBucket: "p2p-text-share.firebasestorage.app",
    messagingSenderId: "765778971463",
    appId: "1:765778971463:web:fb30efe69bc41d63d11a62",
    databaseURL:
        "https://p2p-text-share-default-rtdb.asia-southeast1.firebasedatabase.app",

};


// ============================================================
// FIREBASE INITIALIZATION
// ============================================================

const firebaseApp =
    initializeApp(firebaseConfig);

const auth =
    getAuth(firebaseApp);

const db =
    getDatabase(firebaseApp);


// ============================================================
// APPLICATION SETTINGS
// ============================================================

const MAX_ACTIVE_USERS = 40;

const MAX_SIGNALING_SIZE = 5000;

const ROOM_CODE_LENGTH = 10;


// ============================================================
// WEBRTC CONFIGURATION
// ============================================================
//
// STUN helps WebRTC discover the public network path.
//
// This does NOT carry your text data.
//
// The actual text still travels through the WebRTC
// DataChannel.
//

const rtcConfiguration = {

    iceServers: [

        {
            urls:
                "stun:stun.l.google.com:19302"
        }

    ]

};


// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;

let currentSlot = null;

let currentRoomCode = null;

let peerConnection = null;

let dataChannel = null;

let answerListener = null;

let roomListener = null;

let slotListener = null;

let receivedTextValue = "";


// ============================================================
// DOM ELEMENTS
// ============================================================

const connectionDot =
    document.getElementById(
        "connectionDot"
    );

const connectionStatus =
    document.getElementById(
        "connectionStatus"
    );

const firebaseStatus =
    document.getElementById(
        "firebaseStatus"
    );

const trafficStatus =
    document.getElementById(
        "trafficStatus"
    );

const createConnectionBtn =
    document.getElementById(
        "createConnectionBtn"
    );

const connectionCard =
    document.getElementById(
        "connectionCard"
    );

const hostSection =
    document.getElementById(
        "hostSection"
    );

const roomCodeElement =
    document.getElementById(
        "roomCode"
    );

const qrCodeElement =
    document.getElementById(
        "qrCode"
    );

const copyLinkBtn =
    document.getElementById(
        "copyLinkBtn"
    );

const waitingMessage =
    document.getElementById(
        "waitingMessage"
    );

const autoJoinSection =
    document.getElementById(
        "autoJoinSection"
    );

const joinMessage =
    document.getElementById(
        "joinMessage"
    );

const messageInput =
    document.getElementById(
        "messageInput"
    );

const characterCount =
    document.getElementById(
        "characterCount"
    );

const sendButton =
    document.getElementById(
        "sendButton"
    );

const receivedText =
    document.getElementById(
        "receivedText"
    );

const copyReceivedButton =
    document.getElementById(
        "copyReceivedButton"
    );


// ============================================================
// STATUS UI
// ============================================================

function setConnectionStatus(
    text,
    state = "normal"
) {

    connectionStatus.textContent =
        text;

    connectionDot.className =
        "status-dot";


    if (state === "connected") {

        connectionDot.classList.add(
            "connected"
        );

    }
    else if (state === "connecting") {

        connectionDot.classList.add(
            "connecting"
        );

    }
    else if (state === "error") {

        connectionDot.classList.add(
            "error"
        );
    }


    updateSendButton();
}


// ============================================================
// FIREBASE STATUS UI
// ============================================================

function setFirebaseStatus(
    text,
    state = "normal"
) {

    firebaseStatus.textContent =
        text;

    firebaseStatus.className =
        "firebase-status";


    if (state === "success") {

        firebaseStatus.classList.add(
            "success"
        );

    }
    else if (state === "warning") {

        firebaseStatus.classList.add(
            "warning"
        );

    }
    else if (state === "error") {

        firebaseStatus.classList.add(
            "error"
        );
    }
}


// ============================================================
// GENERATE RANDOM ROOM CODE
// ============================================================

function generateRoomCode() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    const randomValues =
        crypto.getRandomValues(
            new Uint32Array(
                ROOM_CODE_LENGTH
            )
        );

    let result = "";

    for (
        let i = 0;
        i < ROOM_CODE_LENGTH;
        i++
    ) {

        result +=
            characters[
            randomValues[i] %
            characters.length
            ];
    }

    return result;
}


// ============================================================
// GET ROOM CODE FROM URL
// ============================================================
//
// GitHub Pages URL might be:
//
// https://username.github.io/p2p-text-share/
//
// So the QR contains the current page URL:
//
// https://username.github.io/p2p-text-share/?room=ABC123
//
// This works both locally and on GitHub Pages.
//

function getRoomFromURL() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const room =
        params.get("room");

    if (!room) {
        return null;
    }

    return room
        .trim()
        .toUpperCase();
}


// ============================================================
// REMOVE ROOM QUERY FROM URL
// ============================================================

function clearRoomFromURL() {

    const url =
        new URL(
            window.location.href
        );

    url.searchParams.delete(
        "room"
    );

    window.history.replaceState(
        {},
        document.title,
        url.toString()
    );
}


// ============================================================
// BUILD QR CONNECTION LINK
// ============================================================

function createConnectionLink(
    roomCode
) {

    const url =
        new URL(
            window.location.href
        );

    url.search = "";

    url.searchParams.set(
        "room",
        roomCode
    );

    return url.toString();
}


// ============================================================
// INITIALIZE FIREBASE
// ============================================================

async function initializeFirebase() {

    try {

        const result =
            await signInAnonymously(
                auth
            );


        currentUser =
            result.user;


        console.log(
            "Firebase Auth UID:",
            currentUser.uid
        );


        setFirebaseStatus(
            "Firebase: connected",
            "success"
        );


        await claimTrafficSlot();

        startTrafficMonitoring();

    }
    catch (error) {

        console.error(
            "Firebase initialization error:",
            error
        );


        setFirebaseStatus(
            "Firebase: connection error",
            "error"
        );


        setConnectionStatus(
            "Unable to connect to Firebase",
            "error"
        );
    }
}


// ============================================================
// CLAIM TRAFFIC SLOT
// ============================================================
//
// We intentionally limit the application to 40 active
// Firebase-connected browsers.
//
// Firebase itself has a higher platform limit, but 40 is
// our application's safety ceiling.
//

async function claimTrafficSlot() {

    if (!currentUser) {

        throw new Error(
            "User is not authenticated."
        );
    }


    for (
        let slot = 1;
        slot <= MAX_ACTIVE_USERS;
        slot++
    ) {

        const slotRef =
            ref(
                db,
                "slots/" + slot
            );


        const transaction =
            await runTransaction(
                slotRef,

                (currentValue) => {

                    // Empty slot.

                    if (
                        currentValue === null
                    ) {

                        return currentUser.uid;
                    }


                    // Already ours.

                    if (
                        currentValue ===
                        currentUser.uid
                    ) {

                        return currentValue;
                    }


                    // Somebody else owns it.
                    // Abort transaction.

                    return;
                }
            );


        if (
            transaction.committed
        ) {

            currentSlot =
                slot;


            // Automatically release the slot when
            // this browser disconnects from Firebase.

            await onDisconnect(
                slotRef
            ).remove();


            return;
        }
    }


    throw new Error(
        "HIGH_TRAFFIC"
    );
}


// ============================================================
// MONITOR ACTIVE USERS
// ============================================================

function startTrafficMonitoring() {

    const slotsRef =
        ref(
            db,
            "slots"
        );


    slotListener =
        onValue(

            slotsRef,

            (snapshot) => {

                const slots =
                    snapshot.val() || {};

                const activeUsers =
                    Object.keys(
                        slots
                    ).length;


                trafficStatus.textContent =
                    `Active users: ${activeUsers}/${MAX_ACTIVE_USERS}`;


                trafficStatus.className =
                    "";


                if (
                    activeUsers >=
                    MAX_ACTIVE_USERS
                ) {

                    trafficStatus.classList.add(
                        "warning"
                    );
                }
            },


            (error) => {

                console.error(
                    "Traffic monitor error:",
                    error
                );


                trafficStatus.textContent =
                    "Active users: unavailable";

                trafficStatus.className =
                    "error";
            }
        );
}


// ============================================================
// HANDLE HIGH TRAFFIC
// ============================================================

function handleHighTraffic() {

    setFirebaseStatus(
        "Firebase: available",
        "success"
    );


    trafficStatus.textContent =
        "High traffic: please try again later.";

    trafficStatus.className =
        "error";


    setConnectionStatus(
        "Too many active users right now",
        "error"
    );


    createConnectionBtn.disabled =
        true;


    messageInput.disabled =
        true;


    sendButton.disabled =
        true;
}


// ============================================================
// WAIT FOR ICE GATHERING
// ============================================================

function waitForIceGatheringComplete(
    pc
) {

    return new Promise(
        (resolve) => {

            if (
                pc.iceGatheringState ===
                "complete"
            ) {

                resolve();

                return;
            }


            function checkState() {

                if (
                    pc.iceGatheringState ===
                    "complete"
                ) {

                    pc.removeEventListener(
                        "icegatheringstatechange",
                        checkState
                    );

                    resolve();
                }
            }


            pc.addEventListener(
                "icegatheringstatechange",
                checkState
            );
        }
    );
}


// ============================================================
// CREATE WEBRTC PEER CONNECTION
// ============================================================

function createPeerConnection() {

    if (peerConnection) {

        try {
            peerConnection.close();
        }
        catch {
            // Ignore.
        }
    }


    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );


    peerConnection.onconnectionstatechange =
        () => {

            console.log(
                "WebRTC connection state:",
                peerConnection.connectionState
            );


            switch (
            peerConnection.connectionState
            ) {

                case "new":

                    setConnectionStatus(
                        "Connection starting...",
                        "connecting"
                    );

                    break;


                case "connecting":

                    setConnectionStatus(
                        "Connecting to device...",
                        "connecting"
                    );

                    break;


                case "connected":

                    setConnectionStatus(
                        "Connected • P2P",
                        "connected"
                    );

                    waitingMessage.textContent =
                        "Connected successfully.";

                    break;


                case "disconnected":

                    setConnectionStatus(
                        "Connection interrupted",
                        "error"
                    );

                    break;


                case "failed":

                    setConnectionStatus(
                        "Connection failed",
                        "error"
                    );

                    break;


                case "closed":

                    setConnectionStatus(
                        "Connection closed"
                    );

                    break;
            }
        };


    peerConnection.oniceconnectionstatechange =
        () => {

            console.log(
                "ICE state:",
                peerConnection.iceConnectionState
            );
        };


    peerConnection.ondatachannel =
        (event) => {

            setupDataChannel(
                event.channel
            );
        };


    return peerConnection;
}


// ============================================================
// SETUP DATA CHANNEL
// ============================================================

function setupDataChannel(
    channel
) {

    dataChannel =
        channel;


    dataChannel.onopen =
        () => {

            setConnectionStatus(
                "Connected • P2P",
                "connected"
            );

            updateSendButton();
        };


    dataChannel.onclose =
        () => {

            updateSendButton();
        };


    dataChannel.onerror =
        (error) => {

            console.error(
                "Data channel error:",
                error
            );
        };


    dataChannel.onmessage =
        (event) => {

            receivedTextValue =
                String(
                    event.data
                );


            receivedText.textContent =
                receivedTextValue;


            copyReceivedButton.disabled =
                false;
        };
}


// ============================================================
// UPDATE SEND BUTTON
// ============================================================

function updateSendButton() {

    const connected =
        dataChannel &&
        dataChannel.readyState ===
        "open";


    const hasText =
        messageInput.value.length >
        0;


    sendButton.disabled =
        !connected ||
        !hasText;
}


// ============================================================
// CHARACTER COUNTER
// ============================================================

messageInput.addEventListener(
    "input",
    () => {

        const count =
            messageInput.value.length;


        characterCount.textContent =
            `${count.toLocaleString()} characters`;


        updateSendButton();
    }
);


// ============================================================
// SEND MESSAGE
// ============================================================

sendButton.addEventListener(
    "click",
    () => {

        if (
            !dataChannel ||
            dataChannel.readyState !==
            "open"
        ) {

            return;
        }


        const text =
            messageInput.value;


        if (!text) {
            return;
        }


        dataChannel.send(
            text
        );


        messageInput.value =
            "";

        characterCount.textContent =
            "0 characters";


        updateSendButton();
    }
);


// ============================================================
// CTRL/CMD + ENTER TO SEND
// ============================================================

messageInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter" &&
            (event.ctrlKey ||
                event.metaKey)
        ) {

            event.preventDefault();

            sendButton.click();
        }
    }
);


// ============================================================
// COPY RECEIVED TEXT
// ============================================================

copyReceivedButton.addEventListener(
    "click",
    async () => {

        if (!receivedTextValue) {
            return;
        }


        try {

            await navigator.clipboard.writeText(
                receivedTextValue
            );


            copyReceivedButton.textContent =
                "Copied!";


            setTimeout(
                () => {

                    copyReceivedButton.textContent =
                        "Copy";

                },
                1200
            );

        }
        catch (error) {

            console.error(
                "Clipboard error:",
                error
            );

            alert(
                "Could not copy automatically."
            );
        }
    }
);


// ============================================================
// COPY CONNECTION LINK
// ============================================================

let currentConnectionLink = "";


copyLinkBtn.addEventListener(
    "click",
    async () => {

        if (
            !currentConnectionLink
        ) {

            return;
        }


        try {

            await navigator.clipboard.writeText(
                currentConnectionLink
            );


            copyLinkBtn.textContent =
                "Copied!";


            setTimeout(
                () => {

                    copyLinkBtn.textContent =
                        "Copy Connection Link";

                },
                1200
            );

        }
        catch (error) {

            console.error(
                error
            );

            alert(
                "Could not copy the link."
            );
        }
    }
);


// ============================================================
// DEVICE A — CREATE CONNECTION
// ============================================================

createConnectionBtn.addEventListener(
    "click",
    async () => {

        try {

            if (!currentUser) {

                throw new Error(
                    "Firebase is not ready."
                );
            }


            if (
                currentSlot === null
            ) {

                throw new Error(
                    "No active connection slot."
                );
            }


            createConnectionBtn.disabled =
                true;


            setConnectionStatus(
                "Creating connection...",
                "connecting"
            );


            createPeerConnection();


            // Device A creates the data channel.

            dataChannel =
                peerConnection.createDataChannel(
                    "text-share"
                );


            setupDataChannel(
                dataChannel
            );


            // Create offer.

            const offer =
                await peerConnection.createOffer();


            await peerConnection.setLocalDescription(
                offer
            );


            // Wait until ICE candidates have been
            // gathered into the SDP.

            await waitForIceGatheringComplete(
                peerConnection
            );


            const finalOffer =
                peerConnection.localDescription;


            const offerString =
                JSON.stringify(
                    finalOffer
                );


            if (
                offerString.length >
                MAX_SIGNALING_SIZE
            ) {

                throw new Error(
                    "The signaling offer is unexpectedly large."
                );
            }


            // Create room.

            currentRoomCode =
                generateRoomCode();


            const roomRef =
                ref(
                    db,
                    "rooms/" +
                    currentRoomCode
                );


            // Create host identity.

            await set(
                ref(
                    db,
                    "rooms/" +
                    currentRoomCode +
                    "/hostUid"
                ),
                currentUser.uid
            );


            // Store offer.

            await set(
                ref(
                    db,
                    "rooms/" +
                    currentRoomCode +
                    "/offer"
                ),
                offerString
            );


            // Create connection link.

            currentConnectionLink =
                createConnectionLink(
                    currentRoomCode
                );


            // Display room code.

            roomCodeElement.textContent =
                currentRoomCode;


            // Generate QR.

            qrCodeElement.innerHTML =
                "";


            new QRCode(
                qrCodeElement,
                {
                    text:
                        currentConnectionLink,

                    width: 250,

                    height: 250,

                    correctLevel:
                        QRCode.CorrectLevel.M
                }
            );


            hostSection.classList.remove(
                "hidden"
            );


            setConnectionStatus(
                "Waiting for device...",
                "connecting"
            );


            // Listen for answer.

            const answerRef =
                ref(
                    db,
                    "rooms/" +
                    currentRoomCode +
                    "/answer"
                );


            answerListener =
                onValue(

                    answerRef,

                    async (snapshot) => {

                        const answer =
                            snapshot.val();


                        if (!answer) {
                            return;
                        }


                        if (
                            !peerConnection
                        ) {
                            return;
                        }


                        try {

                            await peerConnection.setRemoteDescription(
                                JSON.parse(
                                    answer
                                )
                            );


                            waitingMessage.textContent =
                                "Answer received. Establishing P2P connection...";


                            setConnectionStatus(
                                "Establishing P2P connection...",
                                "connecting"
                            );


                        }
                        catch (error) {

                            console.error(
                                "Failed to apply answer:",
                                error
                            );


                            setConnectionStatus(
                                "Invalid connection response",
                                "error"
                            );
                        }

                    },

                    (error) => {

                        console.error(
                            "Answer listener error:",
                            error
                        );
                    }
                );


        }
        catch (error) {

            console.error(
                "Create connection error:",
                error
            );


            createConnectionBtn.disabled =
                false;


            if (
                error.message ===
                "HIGH_TRAFFIC"
            ) {

                handleHighTraffic();

                return;
            }


            setConnectionStatus(
                error.message ||
                "Could not create connection.",
                "error"
            );
        }
    }
);


// ============================================================
// AUTOMATIC JOIN
// ============================================================
//
// If the phone opens:
//
// https://site.github.io/project/?room=ABC123
//
// the application automatically joins the room.
//

async function autoJoinRoom(
    roomCode
) {

    try {

        if (!currentUser) {

            throw new Error(
                "Firebase is not ready."
            );
        }


        if (!roomCode) {
            return;
        }


        currentRoomCode =
            roomCode;


        autoJoinSection.classList.remove(
            "hidden"
        );


        joinMessage.textContent =
            "Finding the connection...";


        setConnectionStatus(
            "Joining connection...",
            "connecting"
        );


        const roomRef =
            ref(
                db,
                "rooms/" +
                roomCode
            );


        // First claim the guest slot in the room.
        //
        // This also allows our security rules to know
        // who is allowed to read the room.

        const guestUidRef =
            ref(
                db,
                "rooms/" +
                roomCode +
                "/guestUid"
            );


        const guestTransaction =
            await runTransaction(
                guestUidRef,

                (currentValue) => {

                    if (
                        currentValue === null
                    ) {

                        return currentUser.uid;
                    }


                    if (
                        currentValue ===
                        currentUser.uid
                    ) {

                        return currentValue;
                    }


                    // Someone else already joined.

                    return;
                }
            );


        if (
            !guestTransaction.committed
        ) {

            throw new Error(
                "This connection is already being used."
            );
        }


        // Now the guest is authorized to read
        // the room.

        const roomSnapshot =
            await get(
                roomRef
            );


        if (
            !roomSnapshot.exists()
        ) {

            throw new Error(
                "Connection not found or expired."
            );
        }


        const room =
            roomSnapshot.val();


        if (!room.offer) {

            throw new Error(
                "Connection offer is missing."
            );
        }


        joinMessage.textContent =
            "Creating secure P2P connection...";


        // Create peer.

        createPeerConnection();


        // Apply offer.

        await peerConnection.setRemoteDescription(
            JSON.parse(
                room.offer
            )
        );


        // Generate answer.

        const answer =
            await peerConnection.createAnswer();


        await peerConnection.setLocalDescription(
            answer
        );


        await waitForIceGatheringComplete(
            peerConnection
        );


        const finalAnswer =
            peerConnection.localDescription;


        const answerString =
            JSON.stringify(
                finalAnswer
            );


        if (
            answerString.length >
            MAX_SIGNALING_SIZE
        ) {

            throw new Error(
                "The signaling answer is unexpectedly large."
            );
        }


        // Send answer to Firebase.

        await set(
            ref(
                db,
                "rooms/" +
                roomCode +
                "/answer"
            ),
            answerString
        );


        joinMessage.textContent =
            "Connection information sent. Waiting for P2P connection...";


        clearRoomFromURL();


    }
    catch (error) {

        console.error(
            "Automatic join failed:",
            error
        );


        if (
            error.message ===
            "Connection not found or expired."
        ) {

            joinMessage.textContent =
                "This connection has expired.";

        }
        else {

            joinMessage.textContent =
                error.message ||
                "Could not join the connection.";
        }


        setConnectionStatus(
            "Could not join connection",
            "error"
        );
    }
}


// ============================================================
// CLEAN UP ROOM
// ============================================================
//
// Host deletes the temporary signaling room after
// the WebRTC connection has successfully been established.
//
// This keeps Firebase clean.
//

async function cleanupRoom() {

    if (
        !currentRoomCode ||
        !currentUser
    ) {

        return;
    }


    try {

        const roomRef =
            ref(
                db,
                "rooms/" +
                currentRoomCode
            );


        const snapshot =
            await get(
                roomRef
            );


        if (
            !snapshot.exists()
        ) {
            return;
        }


        const room =
            snapshot.val();


        if (
            room.hostUid ===
            currentUser.uid
        ) {

            await remove(
                roomRef
            );
        }

    }
    catch (error) {

        console.warn(
            "Room cleanup failed:",
            error
        );
    }
}


// ============================================================
// CLEANUP WHEN PAGE IS CLOSED
// ============================================================

window.addEventListener(
    "beforeunload",
    () => {

        // onDisconnect handles slot cleanup
        // server-side, so we don't rely on
        // beforeunload for important cleanup.

        if (
            peerConnection
        ) {

            try {
                peerConnection.close();
            }
            catch {
                // Ignore.
            }
        }
    }
);


// ============================================================
// CLEANUP AFTER P2P CONNECTION
// ============================================================

let cleanupTimerStarted =
    false;


function startRoomCleanupTimer() {

    if (cleanupTimerStarted) {
        return;
    }


    cleanupTimerStarted =
        true;


    setTimeout(
        () => {

            cleanupRoom();

        },
        5000
    );
}


// Watch for successful connection.

setInterval(
    () => {

        if (
            peerConnection &&
            peerConnection.connectionState ===
            "connected"
        ) {

            startRoomCleanupTimer();

        }

    },
    1000
);


// ============================================================
// START APPLICATION
// ============================================================

async function startApplication() {

    await initializeFirebase();


    // If this page was opened from a QR code,
    // automatically join the room.

    const roomFromURL =
        getRoomFromURL();


    if (roomFromURL) {

        await autoJoinRoom(
            roomFromURL
        );
    }
}


startApplication();