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
        console.log(">> Fetching SolarPlant device data...");
        const snapshot = await db.ref('SolarPlant/device_data').once('value');
        const devices = snapshot.val();

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
            
            // Tally status logs
            if (d.status_log) {
                for (const [key, val] of Object.entries(d.status_log)) {
                    if (val.event === 'online') stats.onlineEvents++;
                    else if (val.event === 'offline') stats.offlineEvents++;
                    else if (val.event === 'fault') stats.sensorFaults++;
                }
            }
            
            // Tally action logs (pump / motor)
            if (d.action_log) {
                for (const [key, val] of Object.entries(d.action_log)) {
                    if (val.action && val.action.includes('Pump ON')) stats.pumpRuns++;
                    if (val.action && val.action.includes('Robot Cleaner Started')) stats.robotRuns++;
                }
            }
        }

        // Write metrics to JSON
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`>> Metrics compiled successfully for date: ${today}`);
        
        // --- PRUNING (Cost Saving) ---
        // Delete all action_log and status_log nodes from Firebase to save space!
        console.log(">> Pruning yesterday's logs from Firebase to save costs...");
        const updates = {};
        for (const id of Object.keys(devices)) {
            updates[`SolarPlant/device_data/${id}/status_log`] = null;
            updates[`SolarPlant/device_data/${id}/action_log`] = null;
        }
        await db.ref().update(updates);
        console.log(">> Firebase logs pruned successfully.");
        
        process.exit(0);

    } catch (error) {
        console.error("Critical logger engine exception:", error);
        process.exit(1);
    }
}

logFleetData();
