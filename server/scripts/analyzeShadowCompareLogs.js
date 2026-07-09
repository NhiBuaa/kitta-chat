const fs = require("fs");
const readline = require("readline");

async function main() {
  const fileArg = process.argv[2];
  let inputSource;

  if (fileArg && fileArg !== "-") {
    if (!fs.existsSync(fileArg)) {
      console.error(`Error: File not found: ${fileArg}`);
      process.exit(1);
    }
    inputSource = fs.createReadStream(fileArg);
  } else {
    inputSource = process.stdin;
  }

  const rl = readline.createInterface({
    input: inputSource,
    terminal: false
  });

  let totalLogs = 0;
  let totalMismatches = 0;
  const scopeCounts = { direct: 0, group: 0 };
  const mismatchTypes = {
    field_mismatch: 0,
    missing_read_model_candidate: 0,
    extra_read_model_candidate: 0
  };
  const fieldMismatches = {
    unreadCount: 0,
    lastMessageId: 0,
    lastMessageAt: 0
  };
  const userMismatches = {};

  for await (const line of rl) {
    let cleanLine = line.trim();
    if (!cleanLine) continue;

    // Strip UTF-8 BOM if present
    if (cleanLine.charCodeAt(0) === 0xFEFF) {
      cleanLine = cleanLine.substring(1);
    }

    let logData = null;

    // 1. Try parsing line as JSON directly
    try {
      logData = JSON.parse(cleanLine);
    } catch (e) {
      // 2. Try to find JSON block in raw string
      const matchIndex = cleanLine.indexOf("Conversation shadow compare mismatch");
      if (matchIndex !== -1) {
        const jsonStart = cleanLine.indexOf("{", matchIndex);
        if (jsonStart !== -1) {
          try {
            logData = JSON.parse(cleanLine.substring(jsonStart));
            logData.event = "Conversation shadow compare mismatch";
          } catch (innerErr) {
            // Ignore parse errors
          }
        }
      }
    }

    if (!logData) continue;

    // Check if the log event represents a mismatch
    const isMismatchEvent = 
      logData.event === "Conversation shadow compare mismatch" || 
      logData.message === "Conversation shadow compare mismatch";

    if (!isMismatchEvent) continue;

    totalLogs++;
    const scope = logData.scope || "unknown";
    scopeCounts[scope] = (scopeCounts[scope] || 0) + 1;

    const userId = logData.userId || "unknown";
    userMismatches[userId] = (userMismatches[userId] || 0) + 1;

    const mismatches = logData.mismatches || [];
    totalMismatches += mismatches.length;

    for (const m of mismatches) {
      const type = m.type || "unknown";
      mismatchTypes[type] = (mismatchTypes[type] || 0) + 1;

      if (type === "field_mismatch") {
        const field = m.field || "unknown";
        fieldMismatches[field] = (fieldMismatches[field] || 0) + 1;
      }
    }
  }

  // Print Report
  console.log("==================================================");
  console.log("CONVERSATION SHADOW COMPARE LOGS ANALYSIS REPORT");
  console.log("==================================================");
  console.log(`Total Mismatch Logs Scanned:  ${totalLogs}`);
  console.log(`Total Mismatches Found:       ${totalMismatches}`);
  console.log();
  console.log("Breakdown by Scope:");
  console.log(`  - Direct Sidebar:  ${scopeCounts.direct || 0}`);
  console.log(`  - Group Sidebar:   ${scopeCounts.group || 0}`);
  if (scopeCounts.unknown) {
    console.log(`  - Unknown Scope:   ${scopeCounts.unknown}`);
  }
  console.log();
  console.log("Breakdown by Mismatch Type:");
  console.log(`  - Field Mismatches:                  ${mismatchTypes.field_mismatch || 0}`);
  console.log(`  - Missing Read Model Candidates:     ${mismatchTypes.missing_read_model_candidate || 0}`);
  console.log(`  - Extra Read Model Candidates:       ${mismatchTypes.extra_read_model_candidate || 0}`);
  if (mismatchTypes.unknown) {
    console.log(`  - Unknown Mismatch Types:            ${mismatchTypes.unknown}`);
  }
  console.log();
  console.log("Breakdown of Field Mismatches:");
  console.log(`  - unreadCount:    ${fieldMismatches.unreadCount || 0}`);
  console.log(`  - lastMessageId:  ${fieldMismatches.lastMessageId || 0}`);
  console.log(`  - lastMessageAt:  ${fieldMismatches.lastMessageAt || 0}`);
  if (fieldMismatches.unknown) {
    console.log(`  - Unknown Fields: ${fieldMismatches.unknown}`);
  }
  console.log();
  console.log("Top Affected Users:");
  const sortedUsers = Object.entries(userMismatches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sortedUsers.length === 0) {
    console.log("  No users affected.");
  } else {
    for (const [uid, count] of sortedUsers) {
      console.log(`  - User ${uid}: ${count} mismatch logs`);
    }
  }
  console.log("==================================================");
}

main().catch(err => {
  console.error("Analysis script failed:", err);
  process.exit(1);
});
