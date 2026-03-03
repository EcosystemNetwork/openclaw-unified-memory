/**
 * OpenClaw Plugin Integration for Unified Memory Interface
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryService } from "./MemoryService.js";
import type { UnifiedMemoryConfig } from "./service.js";
import { InMemoryAdapter } from "./adapters/InMemoryAdapter.js";

// ============================================================================
// Plugin Configuration Schema
// ============================================================================

export const unifiedMemoryConfigSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true },
    defaultBackend: { type: "string", default: "default" },
    backends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["memory", "lancedb", "sqlite", "file"] },
          name: { type: "string" },
          config: { type: "object" },
          readOnly: { type: "boolean", default: false },
        },
        required: ["id", "type"],
      },
    },
    migration: {
      type: "object",
      properties: {
        autoMigrate: { type: "boolean", default: false },
        source: { type: "string" },
        target: { type: "string" },
        backupBeforeMigrate: { type: "boolean", default: true },
        conflictResolution: {
          type: "string",
          enum: ["skip", "overwrite", "rename"],
          default: "rename",
        },
      },
    },
    introspection: {
      type: "object",
      properties: {
        auditLog: { type: "boolean", default: true },
        queryLogging: { type: "boolean", default: false },
        statsCollection: { type: "boolean", default: true },
        healthCheckInterval: { type: "number", default: 300000 },
      },
    },
    autoCapture: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: false },
        maxChars: { type: "number", default: 500 },
        triggers: {
          type: "array",
          items: { type: "string" },
          default: ["remember", "prefer", "decided"],
        },
        minImportance: { type: "number", default: 0.5 },
      },
    },
    autoRecall: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: false },
        maxMemories: { type: "number", default: 5 },
        minScore: { type: "number", default: 0.3 },
      },
    },
  },
  required: ["backends"],
};

// ============================================================================
// Plugin Factory
// ============================================================================

export function createUnifiedMemoryPlugin(config: UnifiedMemoryConfig) {
  return {
    id: "unified-memory",
    name: "Unified Memory Interface",
    description:
      "Multi-backend memory system with migration and introspection capabilities",
    version: "0.1.0",
    kind: "memory" as const,

    register(api: OpenClawPluginApi) {
      const service = new MemoryService(config);

      // Initialize service
      api.on("plugin_init", async () => {
        await service.initialize();

        // Register backends from config
        for (const backendConfig of config.backends) {
          // In a real implementation, we'd look up the adapter factory
          // based on backendConfig.type and create the adapter
          console.log(
            `[UnifiedMemory] Registering backend: ${backendConfig.id} (${backendConfig.type})`
          );
        }

        // Auto-migrate if configured
        if (config.migration?.autoMigrate && config.migration.source && config.migration.target) {
          api.logger.info(
            `[UnifiedMemory] Auto-migrating from ${config.migration.source} to ${config.migration.target}`
          );
          await service.migrate(
            config.migration.source,
            config.migration.target,
            {
              onConflict: config.migration.conflictResolution,
            }
          );
        }
      });

      // Register tools
      api.registerTool(
        {
          name: "memory_store",
          label: "Store Memory",
          description: "Store a memory in the unified memory system",
          parameters: Type.Object({
            content: Type.String({ description: "Content to remember" }),
            category: Type.Optional(
              Type.String({
                description: "Memory category",
                enum: ["preference", "fact", "decision", "entity", "other"],
              })
            ),
            importance: Type.Optional(
              Type.Number({ description: "Importance (0-1)", minimum: 0, maximum: 1 })
            ),
            tags: Type.Optional(
              Type.Array(Type.String(), { description: "Tags for organization" })
            ),
          }),
          async execute(_toolCallId, params) {
            const entry = await service.store({
              content: params.content as string,
              metadata: {
                category: (params.category as string) ?? "other",
                importance: (params.importance as number) ?? 0.5,
                tags: (params.tags as string[]) ?? [],
              },
            });

            return {
              content: [
                {
                  type: "text",
                  text: `Stored memory: ${entry.id.slice(0, 8)}...`,
                },
              ],
              details: { id: entry.id, category: entry.metadata.category },
            };
          },
        },
        { name: "memory_store" }
      );

      api.registerTool(
        {
          name: "memory_search",
          label: "Search Memories",
          description: "Search memories using semantic or keyword search",
          parameters: Type.Object({
            query: Type.String({ description: "Search query" }),
            limit: Type.Optional(Type.Number({ description: "Max results", default: 5 })),
            minScore: Type.Optional(
              Type.Number({ description: "Minimum similarity score", default: 0.3 })
            ),
            category: Type.Optional(
              Type.String({
                description: "Filter by category",
                enum: ["preference", "fact", "decision", "entity", "other"],
              })
            ),
          }),
          async execute(_toolCallId, params) {
            const filter = params.category
              ? { category: { $eq: params.category as string } }
              : undefined;

            const results = await service.search({
              text: params.query as string,
              limit: (params.limit as number) ?? 5,
              minScore: (params.minScore as number) ?? 0.3,
              filter,
            });

            if (results.length === 0) {
              return {
                content: [{ type: "text", text: "No memories found." }],
                details: { count: 0 },
              };
            }

            const text = results
              .map(
                (r, i) =
                  `${i + 1}. [${r.entry.metadata.category}] ${r.entry.content.slice(0, 100)}... (${
                    (r.score * 100).toFixed(0)
                  }%)`
              )
              .join("\n");

            return {
              content: [{ type: "text", text: `Found ${results.length} memories:\n\n${text}` }],
              details: {
                count: results.length,
                memories: results.map((r) => ({
                  id: r.entry.id,
                  content: r.entry.content,
                  category: r.entry.metadata.category,
                  score: r.score,
                })),
              },
            };
          },
        },
        { name: "memory_search" }
      );

      api.registerTool(
        {
          name: "memory_forget",
          label: "Forget Memory",
          description: "Delete a memory by ID or search query",
          parameters: Type.Object({
            id: Type.Optional(Type.String({ description: "Memory ID to delete" })),
            query: Type.Optional(Type.String({ description: "Search to find memory to delete" })),
          }),
          async execute(_toolCallId, params) {
            if (params.id) {
              const deleted = await service.delete(params.id as string);
              return {
                content: [
                  {
                    type: "text",
                    text: deleted ? "Memory deleted." : "Memory not found.",
                  },
                ],
                details: { deleted },
              };
            }

            if (params.query) {
              const results = await service.search({
                text: params.query as string,
                limit: 5,
              });

              if (results.length === 0) {
                return {
                  content: [{ type: "text", text: "No matching memories found." }],
                  details: { found: 0 },
                };
              }

              if (results.length === 1) {
                await service.delete(results[0]!.entry.id);
                return {
                  content: [
                    {
                      type: "text",
                      text: `Deleted: "${results[0]!.entry.content.slice(0, 60)}..."`,
                    },
                  ],
                  details: { deleted: 1, id: results[0]!.entry.id },
                };
              }

              const list = results
                .map((r) => `- [${r.entry.id.slice(0, 8)}] ${r.entry.content.slice(0, 60)}...`)
                .join("\n");

              return {
                content: [
                  {
                    type: "text",
                    text: `Found ${results.length} candidates. Specify id:\n${list}`,
                  },
                ],
                details: { candidates: results.map((r) => r.entry.id) },
              };
            }

            return {
              content: [{ type: "text", text: "Provide id or query." }],
              details: { error: "missing_param" },
            };
          },
        },
        { name: "memory_forget" }
      );

      // Register CLI commands
      api.registerCli(
        ({ program }) => {
          const memory = program
            .command("memory")
            .description("Unified memory commands");

          memory
            .command("stats")
            .description("Show memory statistics")
            .option("--backend <id>", "Specific backend")
            .action(async (opts) => {
              const stats = await service.stats(opts.backend);
              console.log(JSON.stringify(stats, null, 2));
            });

          memory
            .command("health")
            .description("Check memory system health")
            .action(async () => {
              const health = await service.health();
              console.log(JSON.stringify(health, null, 2));
            });

          memory
            .command("list-backends")
            .description("List configured backends")
            .action(async () => {
              const backends = await service.listBackends();
              console.table(backends);
            });

          memory
            .command("migrate")
            .description("Migrate memories between backends")
            .requiredOption("--from <source>", "Source backend")
            .requiredOption("--to <target>", "Target backend")
            .option("--dry-run", "Simulate migration without changes")
            .option("--conflict <mode>", "Conflict resolution: skip, overwrite, rename")
            .action(async (opts) => {
              const result = await service.migrate(opts.from, opts.to, {
                dryRun: opts.dryRun,
                onConflict: opts.conflict,
                onProgress: (p) => {
                  console.log(`[${p.phase}] ${p.percentage.toFixed(1)}% (${p.current}/${p.total})`);
                },
              });

              console.log("\nMigration complete:");
              console.log(`  Migrated: ${result.migrated}`);
              console.log(`  Skipped: ${result.skipped}`);
              console.log(`  Failed: ${result.failed}`);
              console.log(`  Duration: ${result.duration}ms`);

              if (result.errors.length > 0) {
                console.log("\nErrors:");
                for (const err of result.errors.slice(0, 10)) {
                  console.log(`  - ${err.id}: ${err.error}`);
                }
              }
            });

          memory
            .command("export")
            .description("Export memories to file")
            .requiredOption("--output <file>", "Output file path")
            .option("--backend <id>", "Specific backend to export")
            .option("--format <format>", "Export format: json, jsonl", "json")
            .action(async (opts) => {
              const exported = await service.export(
                { format: opts.format },
                opts.backend
              );

              const fs = await import("node:fs");
              if (opts.format === "jsonl") {
                const lines = exported.entries
                  .map((e) => JSON.stringify(e))
                  .join("\n");
                fs.writeFileSync(opts.output, lines);
              } else {
                fs.writeFileSync(opts.output, JSON.stringify(exported, null, 2));
              }

              console.log(`Exported ${exported.entries.length} memories to ${opts.output}`);
            });

          memory
            .command("import")
            .description("Import memories from file")
            .requiredOption("--input <file>", "Input file path")
            .option("--backend <id>", "Target backend")
            .option("--conflict <mode>", "Conflict resolution: skip, overwrite, rename")
            .action(async (opts) => {
              const fs = await import("node:fs");
              const content = fs.readFileSync(opts.input, "utf-8");

              let entries;
              if (opts.input.endsWith(".jsonl")) {
                entries = content
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((l) => JSON.parse(l));
              } else {
                const parsed = JSON.parse(content);
                entries = parsed.entries ?? parsed;
              }

              const result = await service.import(
                {
                  entries,
                  onConflict: opts.conflict ?? "rename",
                },
                opts.backend
              );

              console.log("Import complete:");
              console.log(`  Imported: ${result.imported}`);
              console.log(`  Skipped: ${result.skipped}`);
              console.log(`  Failed: ${result.failed}`);

              if (result.errors.length > 0) {
                console.log("\nErrors:");
                for (const err of result.errors.slice(0, 10)) {
                  console.log(`  - ${err.entry}: ${err.error}`);
                }
              }
            });

          memory
            .command("duplicates")
            .description("Find potential duplicate memories")
            .option("--threshold <score>", "Similarity threshold", "0.95")
            .action(async (opts) => {
              const duplicates = await service.detectDuplicates(
                parseFloat(opts.threshold)
              );

              if (duplicates.length === 0) {
                console.log("No duplicates found.");
                return;
              }

              console.log(`Found ${duplicates.length} potential duplicates:\n`);
              for (const dup of duplicates) {
                console.log(`Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
                console.log(`  A: ${dup.entries[0].content.slice(0, 80)}...`);
                console.log(`  B: ${dup.entries[1].content.slice(0, 80)}...`);
                console.log();
              }
            });
        },
        { commands: ["memory"] }
      );

      // Lifecycle hooks for auto-capture/recall
      if (config.autoRecall?.enabled) {
        api.on("before_agent_start", async (event) => {
          if (!event.prompt || event.prompt.length < 5) {
            return;
          }

          try {
            const results = await service.search({
              text: event.prompt,
              limit: config.autoRecall?.maxMemories ?? 5,
              minScore: config.autoRecall?.minScore ?? 0.3,
            });

            if (results.length === 0) {
              return;
            }

            const memories = results
              .map(
                (r) =
                  `[${r.entry.metadata.category}] ${r.entry.content}`
              )
              .join("\n");

            return {
              prependContext: `<relevant-memories>\n${memories}\n</relevant-memories>`,
            };
          } catch (err) {
            api.logger.warn(`[UnifiedMemory] Recall failed: ${String(err)}`);
          }
        });
      }

      // Cleanup on shutdown
      api.on("plugin_stop", async () => {
        await service.close();
      });

      api.logger.info("[UnifiedMemory] Plugin registered");
    },
  };
}
