const fs = require('fs');

const HISTORY_FILE = "solar_fleet_history.json";
const MAX_DAYS = 0;

function pruneLogs() {
    if (!fs.existsSync(HISTORY_FILE)) {
        console.log(">> No history file found to prune.");
        return;
    }

    let history;
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
        console.error(">> Error reading history file:", e);
        return;
    }

    if (MAX_DAYS === 0) {
        console.log(">> MAX_DAYS is 0. Erasing all history immediately...");
        fs.writeFileSync(HISTORY_FILE, JSON.stringify({}, null, 2));
        console.log(">> Pruned successfully. History is completely empty.");
        return;
    }

    const dates = Object.keys(history).sort();
    if (dates.length <= MAX_DAYS) {
        console.log(`>> History contains ${dates.length} days. No pruning needed.`);
        return;
    }

    console.log(`>> History contains ${dates.length} days. Pruning to last ${MAX_DAYS} days...`);
    const datesToKeep = dates.slice(-MAX_DAYS);
    const prunedHistory = {};

    for (const date of datesToKeep) {
        prunedHistory[date] = history[date];
    }

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(prunedHistory, null, 2));
    console.log(`>> Pruned successfully. Oldest date is now ${datesToKeep[0]}.`);
}

pruneLogs();
