const admin = require('firebase-admin');

// ── SECURE ENVIRONMENT CHECK ──
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const DATABASE_URL = "https://solarplants-780ad-default-rtdb.firebaseio.com/";
const MAX_DAYS = 30;

if (!serviceAccountRaw) {
    console.error("CRITICAL AUTH EXCEPTION: FIREBASE_SERVICE_ACCOUNT environmental token missing.");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(serviceAccountRaw);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: DATABASE_URL
    });
    console.log(">> Secure Firebase Admin SDK initialized for Cloud Pruning.");
} catch (parseError) {
    console.error("CRITICAL AUTH EXCEPTION: Failed to parse credentials JSON string.", parseError);
    process.exit(1);
}

const db = admin.database();

async function cleanFirebaseLogs() {
    try {
        console.log(`>> Starting Firebase Cloud Garbage Collection (Retention: ${MAX_DAYS} days)`);
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - MAX_DAYS);
        cutoffDate.setHours(0, 0, 0, 0); // Midnight UTC alignment
        const cutoffUnixSecs = Math.floor(cutoffDate.getTime() / 1000);

        console.log(`>> Cutoff Date: ${cutoffDate.toISOString().split('T')[0]}`);
        
        const snapshot = await db.ref('SolarPlant/device_data').once('value');
        const devices = snapshot.val();

        if (!devices) {
            console.log(">> No devices found in database.");
            process.exit(0);
        }

        let deletedStatusLogs = 0;
        let deletedActionLogs = 0;

        // Iterate through every device to scrub expired logs directly from the cloud
        for (const [deviceId, deviceData] of Object.entries(devices)) {
            
            // Clean status_log (Structured by Push IDs containing Unix timestamps)
            if (deviceData.status_log) {
                for (const [pushId, logData] of Object.entries(deviceData.status_log)) {
                    if (logData.ts && logData.ts < cutoffUnixSecs) {
                        await db.ref(`SolarPlant/device_data/${deviceId}/status_log/${pushId}`).remove();
                        deletedStatusLogs++;
                    }
                }
            }

            // Clean action_log (Structured by Push IDs containing Unix timestamps)
            if (deviceData.action_log) {
                for (const [pushId, logData] of Object.entries(deviceData.action_log)) {
                    if (logData.ts && logData.ts < cutoffUnixSecs) {
                        await db.ref(`SolarPlant/device_data/${deviceId}/action_log/${pushId}`).remove();
                        deletedActionLogs++;
                    }
                }
            }
        }

        console.log(`>> Cloud Pruning Complete!`);
        console.log(`>> Deleted ${deletedStatusLogs} old status_log events.`);
        console.log(`>> Deleted ${deletedActionLogs} old action_log events.`);
        
        process.exit(0);
    } catch (error) {
        console.error("Critical Firebase cleaner exception:", error);
        process.exit(1);
    }
}

cleanFirebaseLogs();
