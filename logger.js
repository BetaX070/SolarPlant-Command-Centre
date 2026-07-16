const fs = require('fs');
const admin = require('firebase-admin');

// ── SECURE ENVIRONMENT CHECK ──
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const DATABASE_URL = "https://solarplants-780ad-default-rtdb.firebaseio.com/";
const HISTORY_FILE = "solar_fleet_history.json";

if (!serviceAccountRaw) {
    console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT missing.");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(serviceAccountRaw);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: DATABASE_URL
    });
    console.log(">> Firebase Admin SDK initialized successfully.");
} catch (parseError) {
    console.error("CRITICAL: Failed to parse credentials JSON.", parseError);
    process.exit(1);
}

const db = admin.database();

async function logFleetData() {
    try {
        console.log(">> Fetching SolarPlant device data and logs...");
        const dataSnapshot = await db.ref('SolarPlant/device_data').once('value');
        const logsSnapshot = await db.ref('SolarPlant/device_logs').once('value');
        const devices = dataSnapshot.val();
        const logs = logsSnapshot.val() || {};

        if (!devices) {
            console.log(">> No devices found.");
            process.exit(0);
        }

        let history = {};
        if (fs.existsSync(HISTORY_FILE)) {
            try {
                history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
            } catch (e) {
                history = {};
            }
        }

        const today = new Date().toISOString().split('T')[0];
        if (!history[today]) history[today] = {};

        // Process each active device
        for (const [id, d] of Object.entries(devices)) {
            // We group metrics by locationId
            const locId = d.locationId || "unassigned";
            
            if (!history[today][locId]) {
                history[today][locId] = { 
                    onlineEvents: 0, 
                    offlineEvents: 0, 
                    sensorFaults: 0, 
                    pumpRuns: 0, 
                    robotRuns: 0 
                };
            }
            
            const stats = history[today][locId];
            
            const deviceLogs = logs[id] || {};
            
            // Tally status logs
            if (deviceLogs.status_log) {
                for (const [key, val] of Object.entries(deviceLogs.status_log)) {
                    if (val.event === 'online') stats.onlineEvents++;
                    else if (val.event === 'offline') stats.offlineEvents++;
                    else if (val.event === 'fault') stats.sensorFaults++;
                }
            }
            
            // Tally action logs (pump / motor)
            if (deviceLogs.action_log) {
                for (const [key, val] of Object.entries(deviceLogs.action_log)) {
                    if (val.action && val.action.includes('Pump ON')) stats.pumpRuns++;
                    if (val.action && val.action.includes('Robot Cleaner Started')) stats.robotRuns++;
                }
            }
        }

        // Write metrics to JSON
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`>> Metrics compiled successfully for date: ${today}`);
        
        // Note: Firebase logs (status_log and action_log) are pruned daily by clean_firebase.js
        // to retain 31 days of history, avoiding hourly deletion.
        process.exit(0);

    } catch (error) {
        console.error("Critical logger engine exception:", error);
        process.exit(1);
    }
}

logFleetData();
