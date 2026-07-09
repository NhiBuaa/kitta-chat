const mongoose = require("mongoose");
const dotenv = require("dotenv");

const { runConversationReconciliationReport } = require("../src/services/conversationReconciliationReport");

function parseReconciliationArgs(args = process.argv.slice(2)) {
  if (args.includes("--write")) {
    throw new Error("Conversation reconciliation is report-only; --write is not supported.");
  }
  return { mode: "report-only" };
}

function printableReport(report) {
  return {
    mode: report.mode,
    summary: report.summary,
    drift: report.drift,
    warnings: report.warnings,
  };
}

async function runManualReconciliation(args = process.argv.slice(2)) {
  parseReconciliationArgs(args);
  dotenv.config();
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required for conversation reconciliation.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const report = await runConversationReconciliationReport();
    console.log(JSON.stringify(printableReport(report), null, 2));
    return report;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runManualReconciliation().catch(async (error) => {
    console.error(error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  parseReconciliationArgs,
  printableReport,
  runManualReconciliation,
};
