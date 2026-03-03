/**
 * Example usage of Unified Memory Interface
 */

import {
  MemoryService,
  InMemoryAdapter,
  type UnifiedMemoryConfig,
} from "../src/index.js";

async function main() {
  // Configuration
  const config: UnifiedMemoryConfig = {
    enabled: true,
    defaultBackend: "memory",
    backends: [
      {
        id: "memory",
        type: "memory",
        name: "In-Memory Test Backend",
        config: {
          maxEntries: 1000,
          latency: 10, // Simulate 10ms latency
        },
      },
    ],
    introspection: {
      auditLog: true,
      queryLogging: true,
      statsCollection: true,
      healthCheckInterval: 60000,
    },
  };

  // Create and initialize service
  const service = new MemoryService(config);
  await service.initialize();

  console.log("=== Unified Memory Interface Demo ===\n");

  // Store some memories
  console.log("Storing memories...");
  
  const memories = [
    {
      content: "User prefers dark mode for all applications",
      metadata: { category: "preference" as const, importance: 0.8, tags: ["ui", "theme"] },
    },
    {
      content: "User's favorite programming language is TypeScript",
      metadata: { category: "preference" as const, importance: 0.7, tags: ["coding", "typescript"] },
    },
    {
      content: "Decision made to use OpenClaw for automation",
      metadata: { category: "decision" as const, importance: 0.9, tags: ["tools", "automation"] },
    },
    {
      content: "User's phone number is +1-555-123-4567",
      metadata: { category: "entity" as const, importance: 0.6, tags: ["contact", "phone"] },
    },
    {
      content: "Project deadline is March 15th, 2026",
      metadata: { category: "fact" as const, importance: 0.9, tags: ["project", "deadline"] },
    },
  ];

  const storedMemories = [];
  for (const mem of memories) {
    const entry = await service.store(mem);
    storedMemories.push(entry);
    console.log(`  ✓ Stored: ${entry.content.slice(0, 50)}... (${entry.id.slice(0, 8)})`);
  }

  // Search memories
  console.log("\nSearching for 'dark mode':");
  const searchResults = await service.search({
    text: "dark mode",
    limit: 3,
  });

  for (const result of searchResults) {
    console.log(`  [${result.entry.metadata.category}] ${result.entry.content.slice(0, 60)}... (${(result.score * 100).toFixed(0)}%)`);
  }

  // Get statistics
  console.log("\nMemory Statistics:");
  const stats = await service.stats();
  console.log(`  Total entries: ${stats.totalEntries}`);
  console.log(`  Storage used: ${(stats.storageUsed / 1024).toFixed(2)} KB`);

  // Health check
  console.log("\nHealth Status:");
  const health = await service.health();
  console.log(`  Overall status: ${health.status}`);
  console.log(`  Readable: ${health.overall.readable ? "✓" : "✗"}`);
  console.log(`  Writable: ${health.overall.writable ? "✓" : "✗"}`);

  // Audit log
  console.log("\nRecent Audit Log:");
  const audit = await service.audit({ operation: "create" });
  for (const entry of audit.slice(-3)) {
    const date = new Date(entry.timestamp).toISOString();
    console.log(`  [${date}] ${entry.operation}: ${entry.memoryId?.slice(0, 8)}`);
  }

  // List backends
  console.log("\nConfigured Backends:");
  const backends = await service.listBackends();
  for (const backend of backends) {
    console.log(`  - ${backend.name} (${backend.type}): ${backend.stats.entries} entries`);
  }

  // Update a memory
  console.log("\nUpdating a memory...");
  const toUpdate = storedMemories[0]!;
  const updated = await service.update(toUpdate.id, {
    content: toUpdate.content + " (updated)",
  });
  console.log(`  ✓ Updated: ${updated.content.slice(0, 60)}...`);

  // Delete a memory
  console.log("\nDeleting a memory...");
  const toDelete = storedMemories[1]!;
  const deleted = await service.delete(toDelete.id);
  console.log(`  ✓ Deleted: ${deleted ? "success" : "failed"}`);

  // Final stats
  console.log("\nFinal Statistics:");
  const finalStats = await service.stats();
  console.log(`  Total entries: ${finalStats.totalEntries}`);

  // Cleanup
  await service.close();
  console.log("\n✓ Demo complete!");
}

main().catch(console.error);
