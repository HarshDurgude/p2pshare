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
    runTransaction,
    update,
    goOnline,
    goOffline
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";


// ============================================================
// FIREBASE CONFIG
// ============================================================

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
// FIREBASE
// ============================================================

const firebaseApp =
    initializeApp(firebaseConfig);

const auth =
    getAuth(firebaseApp);

const db =
    getDatabase(firebaseApp);


// ============================================================
// SETTINGS
// ============================================================

const MAX_HANDSHAKES = 40;

const ROOM_LIFETIME_MS =
    60 * 1000; // 1 minute

const MAX_SIGNALING_SIZE = 5000;

const ROOM_CODE_LENGTH = 10;


// ============================================================
// WEBRTC
// ============================================================

const rtcConfiguration = {

    iceServers: [

        {
            urls:
                "stun:stun.l.google.com:19302"
        }

    ]

};


// ============================================================
// STATE
// ============================================================

let currentUser = null;

let currentSlot = null;

let currentRoomCode = null;

let currentRole = null;

let peerConnection = null;

let dataChannel = null;

let answerUnsubscribe = null;

let roomUnsubscribe = null;

let slotListenerUnsubscribe = null;

let handshakeTimer = null;

let handshakeActive = false;

let firebaseOnline = true;

let receivedTextValue = "";


// ============================================================
// DOM
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
// STATUS
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
// FIREBASE STATUS
// ============================================================

function setFirebaseStatus(
    text,
    state = "normal"
) {

    firebaseStatus.textContent =
        text;

    firebaseStatus.className =
        "";


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
// ROOM CODE
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
// URL
// ============================================================

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
// FIREBASE INITIALIZATION
// ============================================================

async function initializeFirebase() {

    try {

        const result =
            await signInAnonymously(
                auth
            );


        currentUser =
            result.user;




        setFirebaseStatus(
            "Firebase: connected",
            "success"
        );


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
    }
}


// ============================================================
// MAKE SURE FIREBASE IS ONLINE
// ============================================================

async function ensureFirebaseOnline() {

    if (!firebaseOnline) {

        goOnline(db);

        firebaseOnline =
            true;

        setFirebaseStatus(
            "Firebase: reconnecting...",
            "warning"
        );

        // Give the SDK a moment to reconnect.

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    300
                )
        );


        setFirebaseStatus(
            "Firebase: connected",
            "success"
        );
    }
}


// ============================================================
// ACTIVE HANDSHAKE MONITOR
// ============================================================

function startTrafficMonitoring() {

    if (slotListenerUnsubscribe) {
        return;
    }


    const slotsRef =
        ref(
            db,
            "slots"
        );


    slotListenerUnsubscribe =
        onValue(

            slotsRef,

            (snapshot) => {

                const slots =
                    snapshot.val() || {};

                const active =
                    Object.keys(
                        slots
                    ).length;


                trafficStatus.textContent =
                    `Active handshakes: ${active}/${MAX_HANDSHAKES}`;


                trafficStatus.className =
                    "";


                if (
                    active >=
                    MAX_HANDSHAKES
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
                    "Active handshakes: unavailable";

                trafficStatus.className =
                    "error";
            }
        );
}


// ============================================================
// CLAIM HANDSHAKE SLOT
// ============================================================

async function claimHandshakeSlot() {

    if (
        !currentUser
    ) {

        throw new Error(
            "Firebase authentication is not ready."
        );
    }


    if (
        currentSlot !== null
    ) {

        return;
    }


    await ensureFirebaseOnline();


    for (
        let slot = 1;
        slot <= MAX_HANDSHAKES;
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


                    return;
                }
            );


        if (
            transaction.committed
        ) {

            currentSlot =
                slot;


            // Server-side cleanup if the browser
            // disappears during handshake.

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
// RELEASE HANDSHAKE SLOT
// ============================================================

async function releaseHandshakeSlot() {

    if (
        currentSlot === null ||
        !currentUser
    ) {

        return;
    }


    const slot =
        currentSlot;


    currentSlot =
        null;


    try {

        await remove(
            ref(
                db,
                "slots/" + slot
            )
        );

    }
    catch (error) {

        console.warn(
            "Could not explicitly release slot:",
            error
        );

        // onDisconnect() is still armed.
    }
}


// ============================================================
// WAIT FOR ICE
// ============================================================

function waitForIceGatheringComplete(
    pc
) {

    return new Promise(
        resolve => {

            if (
                pc.iceGatheringState ===
                "complete"
            ) {

                resolve();

                return;
            }


            function check() {

                if (
                    pc.iceGatheringState ===
                    "complete"
                ) {

                    pc.removeEventListener(
                        "icegatheringstatechange",
                        check
                    );

                    resolve();
                }
            }


            pc.addEventListener(
                "icegatheringstatechange",
                check
            );
        }
    );
}


// ============================================================
// CREATE PEER CONNECTION
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
        async () => {

            const state =
                peerConnection.connectionState;


            console.log(
                "WebRTC connection:",
                state
            );


            switch (state) {

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
                        "P2P connection established.";


                    joinMessage.textContent =
                        "P2P connection established.";


                    // Remove handshake UI.

                    autoJoinSection.classList.add(
                        "hidden"
                    );


                    // The important part:
                    //
                    // Firebase is no longer needed.

                    await finishSuccessfulHandshake();

                    break;


                case "disconnected":

                    // Do NOT immediately kill the connection.
                    //
                    // WebRTC may recover.

                    setConnectionStatus(
                        "P2P temporarily disconnected...",
                        "connecting"
                    );

                    break;


                case "failed":

                    setConnectionStatus(
                        "P2P connection lost",
                        "error"
                    );


                    showP2PLostState();

                    break;


                case "closed":

                    setConnectionStatus(
                        "P2P connection closed",
                        "error"
                    );

                    break;
            }
        };


    peerConnection.oniceconnectionstatechange =
        () => {

            console.log(
                "ICE:",
                peerConnection.iceConnectionState
            );
        };


    peerConnection.ondatachannel =
        event => {

            setupDataChannel(
                event.channel
            );
        };


    return peerConnection;
}


// ============================================================
// DATA CHANNEL
// ============================================================

function setupDataChannel(
    channel
) {

    dataChannel =
        channel;


    dataChannel.onopen =
        async () => {

            setConnectionStatus(
                "Connected • P2P",
                "connected"
            );


            updateSendButton();


            await finishSuccessfulHandshake();
        };


    dataChannel.onclose =
        () => {

            updateSendButton();
        };


    dataChannel.onerror =
        error => {

            console.error(
                "Data channel error:",
                error
            );
        };


    dataChannel.onmessage =
        event => {

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
// FINISH SUCCESSFUL HANDSHAKE
// ============================================================

let handshakeFinishStarted =
    false;


async function finishSuccessfulHandshake() {

    if (
        handshakeFinishStarted
    ) {

        return;
    }


    if (
        !peerConnection ||
        peerConnection.connectionState !==
        "connected"
    ) {

        return;
    }


    handshakeFinishStarted =
        true;

    handshakeActive =
        false;


    stopHandshakeTimer();


    // Stop Firebase listeners.

    if (
        answerUnsubscribe
    ) {

        answerUnsubscribe();

        answerUnsubscribe =
            null;
    }


    if (
        roomUnsubscribe
    ) {

        roomUnsubscribe();

        roomUnsubscribe =
            null;
    }


    try {

        // Host removes the temporary signaling room.

        if (
            currentRole === "host" &&
            currentRoomCode
        ) {

            await remove(
                ref(
                    db,
                    "rooms/" +
                    currentRoomCode
                )
            );
        }


        // Release this device's handshake slot.

        await releaseHandshakeSlot();


    }
    catch (error) {

        console.warn(
            "Handshake cleanup error:",
            error
        );
    }


    currentRoomCode =
        null;

    currentRole =
        null;


    // IMPORTANT:
    //
    // WebRTC remains alive.
    //
    // Firebase is now disconnected.

    try {

        goOffline(db);

        firebaseOnline =
            false;


        setFirebaseStatus(
            "Firebase: disconnected • P2P active",
            "success"
        );

    }
    catch (error) {

        console.warn(
            "Could not disconnect Firebase:",
            error
        );
    }
}


// ============================================================
// HANDSHAKE TIMER
// ============================================================

function startHandshakeTimer() {

    stopHandshakeTimer();


    handshakeActive =
        true;


    handshakeTimer =
        setTimeout(
            async () => {

                if (
                    !handshakeActive
                ) {

                    return;
                }


                await expireHandshake();

            },
            ROOM_LIFETIME_MS
        );
}


function stopHandshakeTimer() {

    if (
        handshakeTimer
    ) {

        clearTimeout(
            handshakeTimer
        );

        handshakeTimer =
            null;
    }
}


// ============================================================
// EXPIRE HANDSHAKE
// ============================================================

async function expireHandshake() {

    if (
        !handshakeActive
    ) {

        return;
    }


    handshakeActive =
        false;


    stopHandshakeTimer();


    // Stop Firebase listeners.

    if (
        answerUnsubscribe
    ) {

        answerUnsubscribe();

        answerUnsubscribe =
            null;
    }


    if (
        roomUnsubscribe
    ) {

        roomUnsubscribe();

        roomUnsubscribe =
            null;
    }


    try {

        if (
            currentRoomCode &&
            currentRole === "host"
        ) {

            await remove(
                ref(
                    db,
                    "rooms/" +
                    currentRoomCode
                )
            );
        }


        await releaseHandshakeSlot();

    }
    catch (error) {

        console.warn(
            "Handshake expiration cleanup:",
            error
        );
    }


    if (
        peerConnection
    ) {

        try {
            peerConnection.close();
        }
        catch {
            // Ignore.
        }

        peerConnection =
            null;
    }


    dataChannel =
        null;


    currentRoomCode =
        null;

    currentRole =
        null;


    clearRoomFromURL();


    resetConnectionUI(
        "Connection expired. Please create a new connection."
    );
}


// ============================================================
// RESET CONNECTION UI
// ============================================================

function resetConnectionUI(
    message = null
) {

    stopHandshakeTimer();


    hostSection.classList.add(
        "hidden"
    );


    autoJoinSection.classList.add(
        "hidden"
    );


    qrCodeElement.innerHTML =
        "";


    roomCodeElement.textContent =
        "--------";


    waitingMessage.textContent =
        "Waiting for the other device...";


    joinMessage.textContent =
        "Connecting to the other device...";


    createConnectionBtn.disabled =
        false;


    if (message) {

        setConnectionStatus(
            message,
            "error"
        );

    }
    else {

        setConnectionStatus(
            "Not connected"
        );
    }


    handshakeActive =
        false;

    handshakeFinishStarted =
        false;


    updateSendButton();
}


// ============================================================
// P2P LOST STATE
// ============================================================

function showP2PLostState() {

    autoJoinSection.classList.add(
        "hidden"
    );


    waitingMessage.textContent =
        "The P2P connection was lost. Create a new connection to reconnect.";


    createConnectionBtn.disabled =
        false;
}


// ============================================================
// HIGH TRAFFIC
// ============================================================

function handleHighTraffic() {

    trafficStatus.textContent =
        "High handshake traffic. Please try again shortly.";

    trafficStatus.className =
        "error";


    setConnectionStatus(
        "Handshake capacity full",
        "error"
    );


    createConnectionBtn.disabled =
        false;
}


// ============================================================
// CREATE CONNECTION
// ============================================================

createConnectionBtn.addEventListener(
    "click",
    async () => {

        try {

            createConnectionBtn.disabled =
                true;


            await ensureFirebaseOnline();


            await claimHandshakeSlot();


            currentRole =
                "host";


            handshakeFinishStarted =
                false;


            setConnectionStatus(
                "Creating connection...",
                "connecting"
            );


            createPeerConnection();


            dataChannel =
                peerConnection.createDataChannel(
                    "text-share"
                );


            setupDataChannel(
                dataChannel
            );


            const offer =
                await peerConnection.createOffer();


            await peerConnection.setLocalDescription(
                offer
            );


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
                    "WebRTC offer is unexpectedly large."
                );
            }


            currentRoomCode =
                generateRoomCode();


            const createdAt =
                Date.now();


            const expiresAt =
                createdAt +
                ROOM_LIFETIME_MS;


            const roomPath =
                "rooms/" +
                currentRoomCode;


            // Atomic multi-location creation.
            //
            // Firebase rules validate all fields.

            const updates = {};


            updates[
                roomPath +
                "/hostUid"
            ] =
                currentUser.uid;


            updates[
                roomPath +
                "/offer"
            ] =
                offerString;


            updates[
                roomPath +
                "/createdAt"
            ] =
                createdAt;


            updates[
                roomPath +
                "/expiresAt"
            ] =
                expiresAt;


            await update(
                ref(db),
                updates
            );


            // If host disappears before handshake,
            // Firebase deletes the temporary room.

            await onDisconnect(
                ref(
                    db,
                    roomPath
                )
            ).remove();


            const link =
                createConnectionLink(
                    currentRoomCode
                );
            currentConnectionLink =
                link;

            roomCodeElement.textContent =
                currentRoomCode;


            qrCodeElement.innerHTML =
                "";


            new QRCode(
                qrCodeElement,
                {
                    text: link,

                    width: 250,

                    height: 250,

                    correctLevel:
                        QRCode.CorrectLevel.M
                }
            );


            hostSection.classList.remove(
                "hidden"
            );


            waitingMessage.textContent =
                "Scan the QR code within 1 minute.";


            setConnectionStatus(
                "Waiting for device...",
                "connecting"
            );


            startHandshakeTimer();


            // Listen for answer.

            const answerRef =
                ref(
                    db,
                    roomPath +
                    "/answer"
                );


            answerUnsubscribe =
                onValue(

                    answerRef,

                    async snapshot => {

                        const answer =
                            snapshot.val();


                        if (
                            !answer ||
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

                        }
                        catch (error) {

                            console.error(
                                "Answer error:",
                                error
                            );


                            setConnectionStatus(
                                "Invalid connection response",
                                "error"
                            );
                        }
                    },

                    error => {

                        console.error(
                            "Answer listener:",
                            error
                        );
                    }
                );

        }
        catch (error) {

            console.error(
                "Create connection:",
                error
            );


            if (
                error.message ===
                "HIGH_TRAFFIC"
            ) {

                await releaseHandshakeSlot();

                handleHighTraffic();

                return;
            }


            await releaseHandshakeSlot();


            if (
                peerConnection
            ) {

                try {
                    peerConnection.close();
                }
                catch {
                    // Ignore.
                }

                peerConnection =
                    null;
            }


            resetConnectionUI(
                error.message ||
                "Could not create connection."
            );
        }
    }
);


// ============================================================
// AUTOMATIC GUEST JOIN
// ============================================================

async function autoJoinRoom(roomCode) {

    try {

        await ensureFirebaseOnline();


        // ====================================================
        // 1. Claim a handshake slot FIRST
        // ====================================================

        await claimHandshakeSlot();


        currentRole = "guest";

        currentRoomCode = roomCode;

        handshakeFinishStarted = false;


        // ====================================================
        // 2. Claim the guest position in the room
        //
        // This must happen BEFORE reading the room.
        // The Firebase rules intentionally protect the room
        // from arbitrary users.
        // ====================================================

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

                currentValue => {

                    // Nobody has joined yet.

                    if (
                        currentValue === null
                    ) {

                        return currentUser.uid;
                    }


                    // We already claimed it.

                    if (
                        currentValue ===
                        currentUser.uid
                    ) {

                        return currentValue;
                    }


                    // Somebody else is already using it.

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


        // ====================================================
        // 3. NOW we are authorized to read the room
        // ====================================================

        const roomRef =
            ref(
                db,
                "rooms/" +
                roomCode
            );


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


        // ====================================================
        // 4. Check the one-minute expiration
        // ====================================================

        if (
            !room.expiresAt ||
            Date.now() >=
            Number(room.expiresAt)
        ) {

            throw new Error(
                "This connection has expired."
            );
        }


        // ====================================================
        // 5. Make sure an offer exists
        // ====================================================

        if (
            !room.offer
        ) {

            throw new Error(
                "Connection offer is missing."
            );
        }


        // ====================================================
        // 6. Create WebRTC connection
        // ====================================================

        setConnectionStatus(
            "Creating secure P2P connection...",
            "connecting"
        );


        joinMessage.textContent =
            "Creating secure P2P connection...";


        createPeerConnection();


        // ====================================================
        // 7. Apply PC's offer
        // ====================================================

        await peerConnection.setRemoteDescription(
            JSON.parse(
                room.offer
            )
        );


        // ====================================================
        // 8. Create answer
        // ====================================================

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
                "WebRTC answer is unexpectedly large."
            );
        }


        // ====================================================
        // 9. Send answer through Firebase
        // ====================================================

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


        // ====================================================
        // 10. Start the one-minute safety timer
        // ====================================================

        startHandshakeTimer();


        // ====================================================
        // 11. Watch the room
        //
        // If the host disappears and Firebase removes
        // the room, the guest can cancel its handshake.
        // ====================================================

        roomUnsubscribe =
            onValue(

                roomRef,

                snapshot => {

                    if (
                        !snapshot.exists() &&
                        handshakeActive
                    ) {

                        expireGuestHandshake(
                            "The other device cancelled the connection."
                        );
                    }

                },

                error => {

                    console.warn(
                        "Room listener:",
                        error
                    );
                }
            );


        // Remove ?room=XXXX from the browser URL.

        clearRoomFromURL();

    }
    catch (error) {

        console.error(
            "Automatic join:",
            error
        );


        // ====================================================
        // Cleanup if anything failed
        // ====================================================

        await releaseHandshakeSlot();


        if (
            peerConnection
        ) {

            try {
                peerConnection.close();
            }
            catch {
                // Ignore.
            }

            peerConnection = null;
        }


        dataChannel = null;


        currentRoomCode = null;

        currentRole = null;


        handshakeActive = false;

        stopHandshakeTimer();


        clearRoomFromURL();


        autoJoinSection.classList.remove(
            "hidden"
        );


        joinMessage.textContent =
            error.message ||
            "Could not join the connection.";


        setConnectionStatus(
            "Could not join connection",
            "error"
        );
    }
}

// ============================================================
// GUEST HANDSHAKE FAILURE
// ============================================================

async function expireGuestHandshake(
    message
) {

    if (
        !handshakeActive
    ) {

        return;
    }


    handshakeActive =
        false;


    stopHandshakeTimer();


    if (
        roomUnsubscribe
    ) {

        roomUnsubscribe();

        roomUnsubscribe =
            null;
    }


    await releaseHandshakeSlot();


    if (
        peerConnection
    ) {

        try {
            peerConnection.close();
        }
        catch {
            // Ignore.
        }

        peerConnection =
            null;
    }


    dataChannel =
        null;


    currentRoomCode =
        null;

    currentRole =
        null;


    clearRoomFromURL();


    resetConnectionUI(
        message
    );
}


// ============================================================
// MESSAGE INPUT
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
// SEND
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
// CTRL/CMD + ENTER
// ============================================================

messageInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter" &&
            (
                event.ctrlKey ||
                event.metaKey
            )
        ) {

            event.preventDefault();

            sendButton.click();
        }
    }
);


// ============================================================
// SEND BUTTON
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
// COPY RECEIVED
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
                "Clipboard:",
                error
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
        }
    }
);


// ============================================================
// START
// ============================================================

async function startApplication() {

    await initializeFirebase();


    const roomFromURL =
        getRoomFromURL();


    if (
        roomFromURL
    ) {

        autoJoinSection.classList.remove(
            "hidden"
        );


        joinMessage.textContent =
            "Finding the connection...";


        setConnectionStatus(
            "Joining connection...",
            "connecting"
        );


        await autoJoinRoom(
            roomFromURL
        );
    }
}


startApplication();