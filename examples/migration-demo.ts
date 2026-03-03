/**
 * Example: Migrating memories between backends
 */

import {
  MemoryService,
  type UnifiedMemoryConfig,
} from "../src/index.js";

async function migrationExample() {
  console.log("=== Memory Migration Demo ===\n");

  // Setup two backends: source (file-based) and target (vector DB)
  const config: UnifiedMemoryConfig = {
    enabled: true,
    defaultBackend: "source",
    backends: [
      {
        id: "source",
        type: "memory", // Simulating file-based storage
        name: "Legacy File Storage",
        config: { maxEntries: 1000 },
      },
      {
        id: "target",
        type: "memory", // Simulating vector DB
        name: "New Vector Database",
        config: { maxEntries: 10000 },
      },
    ],
    introspection: {
      auditLog: true,
      queryLogging: false,
      statsCollection: true,
      healthCheckInterval: 60000,
    },
  };

  const service = new MemoryService(config);
  await service.initialize();

  // Seed source backend with some data
  console.log("Seeding source backend with sample data...");
  const sourceBackend = await service.getBackend("source");
  
  for (let i = 0; i < 20; i++) {
    await service.store(
      {
        content: `Sample memory #${i + 1}: This is test content for migration demonstration`,
        metadata: {
          category: i % 2 === 0 ? "fact" : "preference",
          importance: 0.5 + Math.random() * 0.5,
          tags: ["migration", `tag-${i % 3}`],
        },
        source: {
          type: "manual",
          tool: "migration-demo",
        },
      },
      "source"
    );
  }

  console.log(`  ✓ Added 20 memories to source backend\n`);

  // Check source stats
  const sourceStats = await service.stats("source");
  console.log("Source backend stats:");
  console.log(`  Total entries: ${sourceStats.totalEntries}`);
  console.log(`  Storage used: ${(sourceStats.storageUsed / 1024).toFixed(2)} KB\n`);

  // Perform dry-run migration
  console.log("Performing dry-run migration...");
  const dryRunResult = await service.migrate("source", "target", {
    dryRun: true,
    onConflict: "rename",
    onProgress: (progress) => {
      if (progress.current % 5 === 0) {
        console.log(`  ${progress.phase}: ${progress.percentage.toFixed(0)}%`);
      }
    },
  });

  console.log(`\nDry-run results:`);
  console.log(`  Would migrate: ${dryRunResult.migrated} entries`);
  console.log(`  Would skip: ${dryRunResult.skipped} entries`);
  console.log(`  Would fail: ${dryRunResult.failed} entries`);
  console.log(`  Estimated duration: ${dryRunResult.duration}ms\n`);

  // Perform actual migration
  console.log("Performing actual migration...");
  const migrationResult = await service.migrate("source", "target", {
    dryRun: false,
    onConflict: "rename",
    onProgress: (progress) => {
      if (progress.current % 5 === 0 || progress.current === progress.total) {
        process.stdout.write(`\r  ${progress.phase}: ${progress.percentage.toFixed(0)}% (${progress.current}/${progress.total})`);
      }
    },
  });
  console.log("\n");

  console.log(`Migration complete!`);
  console.log(`  Migrated: ${migrationResult.migrated} entries`);
  console.log(`  Skipped: ${migrationResult.skipped} entries`);
  console.log(`  Failed: ${migrationResult.failed} entries`);
  console.log(`  Duration: ${migrationResult.duration}ms\n`);

  // Verify migration
  console.log("Verifying migration...");
  const targetStats = await service.stats("target");
  console.log(`  Target backend now has: ${targetStats.totalEntries} entries`);
  
  if (targetStats.totalEntries === sourceStats.totalEntries) {
    console.log("  ✓ All entries migrated successfully!");
  } else {
    console.log("  ⚠ Mismatch in entry count");
  }

  // Check audit log for migration events
  console.log("\nMigration audit log:");
  const audit = await service.audit({ operation: "migrate" });
  for (const entry of audit) {
    const date = new Date(entry.timestamp).toISOString();
    console.log(`  [${date}] ${entry.operation}: ${JSON.stringify(entry.details)}`);
  }

  // Export migrated data
  console.log("\nExporting migrated data...");
  const exportData = await service.export({ format: "json" }, "target");
  console.log(`  Exported ${exportData.entries.length} entries`);
  console.log(`  Metadata: ${JSON.stringify(exportData.metadata, null, 2)}`);

  // Cleanup
  await service.close();
  console.log("\n✓ Migration demo complete!");
}

migrationExample().catch(console.error);
