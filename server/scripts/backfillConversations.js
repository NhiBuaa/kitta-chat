const mongoose = require("mongoose");
const dotenv = require("dotenv");

const { runConversationBackfillWrite } = require("../src/services/conversationBackfillWrite");

dotenv.config();

function parseBackfillArgs(args = process.argv.slice(2)) {
  return {
    write: args.includes("--write"),
  };
}

function printableReport(report) {
  return {
    mode: report.mode,
    dryRunSummary: report.dryRun.summary,
    warnings: {
      malformedDirectConversationIds: report.dryRun.malformedDirectConversationIds,
      missingGroups: report.dryRun.missingGroups,
      groupMemberMismatches: report.dryRun.groupMemberMismatches,
      duplicateOrAmbiguousLegacyIds: report.dryRun.duplicateOrAmbiguousLegacyIds,
    },
    created: report.created,
    updated: report.updated,
    skipped: report.skipped,
    errors: report.errors,
  };
}

async function runManualBackfill(args = process.argv.slice(2)) {
  const options = parseBackfillArgs(args);
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required for conversation backfill.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const before = await runConversationBackfillWrite({ write: false });
    if (!options.write) {
      console.log(JSON.stringify(printableReport(before), null, 2));
      return before;
    }

    const writeReport = await runConversationBackfillWrite({ write: true });
    const after = await runConversationBackfillWrite({ write: false });
    const output = {
      before: printableReport(before),
      write: printableReport(writeReport),
      after: printableReport(after),
    };
    console.log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runManualBackfill().catch(async (error) => {
    console.error(error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  parseBackfillArgs,
  printableReport,
  runManualBackfill,
};
