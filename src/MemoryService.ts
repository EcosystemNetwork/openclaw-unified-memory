/**
 * Unified Memory Service Implementation
 */

import { randomUUID } from "node:crypto";
import type {
  AuditEntry,
  AuditFilter,
  DeleteResult,
  ExportOptions,
  HealthStatus,
  ImportResult,
  MemoryCategory,
  MemoryEntry,
  MemoryExport,
  MemoryImport,
  MemoryMetadata,
  MemorySource,
  MemoryStats,
  PotentialDuplicate,
  QueryExplanation,
  SearchQuery,
  SearchResult,
  SimilarityCluster,
  StoreBatchInput,
  StoreInput,
  Timestamps,
  UpdatePatch,
} from "./types.js";
import type { MemoryBackendAdapter } from "./adapters/types.js";
import type {
  BackendInfo,
  MigrationOptions,
  MigrationProgress,
  MigrationResult,
  UnifiedMemoryConfig,
  UnifiedMemoryService,
} from "./service.js";

// ============================================================================
// Configuration Defaults
// ============================================================================

const DEFAULT_CONFIG: Partial<UnifiedMemoryConfig> = {
  enabled: true,
  defaultBackend: "default",
  migration: {
    autoMigrate: false,
    backupBeforeMigrate: true,
    conflictResolution: "rename",
  },
  introspection: {
    auditLog: true,
    queryLogging: false,
    statsCollection: true,
    healthCheckInterval: 5 * 60 * 1000, // 5 minutes
  },
  autoCapture: {
    enabled: false,
    maxChars: 500,
    triggers: [
      "remember",
      "prefer",
      "decided",
      "always",
      "never",
      "important",
    ],
    minImportance: 0.5,
  },
  autoRecall: {
    enabled: false,
    maxMemories: 5,
    minScore: 0.3,
  },
  cache: {
    enabled: true,
    maxEntries: 1000,
    ttl: 5 * 60 * 1000, // 5 minutes
  },
  logging: {
    level: "info",
    slowQueryThreshold: 1000,
  },
};

// ============================================================================
// Implementation
// ============================================================================

export class MemoryService implements UnifiedMemoryService {
  private config: UnifiedMemoryConfig;
  private backends = new Map<string, MemoryBackendAdapter>();
  private auditLog: AuditEntry[] = [];
  private initialized = false;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: UnifiedMemoryConfig) {
    this.config = this.mergeConfig(config);
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize all backends
    for (const backendConfig of this.config.backends) {
      // In a real implementation, we'd look up the adapter factory
      // and create the backend instance
      console.log(`Initializing backend: ${backendConfig.id}`);
    }

    // Start health checks
    if (this.config.introspection?.healthCheckInterval) {
      this.startHealthChecks();
    }

    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    for (const [id, backend] of this.backends) {
      try {
        await backend.close();
      } catch (err) {
        console.error(`Error closing backend ${id}:`, err);
      }
    }

    this.backends.clear();
    this.initialized = false;
  }

  // ========================================================================
  // Core Operations
  // ========================================================================

  async store(input: StoreInput, backendId?: string): Promise<MemoryEntry> {
    const backend = await this.resolveBackend(backendId);
    const entry = this.createMemoryEntry(input);

    await backend.store(entry);

    this.logAudit({
      operation: "create",
      memoryId: entry.id,
      agentId: entry.metadata.agentId,
      sessionKey: entry.metadata.sessionKey,
      details: { category: entry.metadata.category },
    });

    return entry;
  }

  async storeBatch(
    input: StoreBatchInput,
    backendId?: string
  ): Promise<MemoryEntry[]> {
    const backend = await this.resolveBackend(backendId);
    const entries = input.entries.map((e) => this.createMemoryEntry(e));

    if (backend.capabilities.bulkImport) {
      await backend.storeBatch(entries);
    } else {
      // Fallback to individual stores
      for (const entry of entries) {
        await backend.store(entry);
      }
    }

    for (const entry of entries) {
      this.logAudit({
        operation: "create",
        memoryId: entry.id,
        agentId: entry.metadata.agentId,
        sessionKey: entry.metadata.sessionKey,
        details: { category: entry.metadata.category },
      });
    }

    return entries;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const backend = await this.resolveBackend();

    const startTime = performance.now();
    const results = await backend.search(query);
    const duration = performance.now() - startTime;

    if (
      this.config.logging?.slowQueryThreshold &&
      duration > this.config.logging.slowQueryThreshold
    ) {
      console.warn(
        `Slow query detected: ${duration.toFixed(2)}ms`,
        JSON.stringify(query)
      );
    }

    return results;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    // Try each backend until found
    for (const backend of this.backends.values()) {
      const entry = await backend.get(id);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  async update(id: string, patch: UpdatePatch): Promise<MemoryEntry> {
    const backend = await this.resolveBackend();

    // Get existing entry
    const existing = await this.findEntryInAnyBackend(id);
    if (!existing) {
      throw new Error(`Memory not found: ${id}`);
    }

    // Apply patch
    const updated: MemoryEntry = {
      ...existing,
      content: patch.content ?? existing.content,
      embedding: patch.embedding ?? existing.embedding,
      metadata: patch.mergeMetadata
        ? { ...existing.metadata, ...(patch.metadata as MemoryMetadata) }
        : { ...existing.metadata, ...(patch.metadata ?? {}) },
      timestamps: {
        ...existing.timestamps,
        updated: Date.now(),
      },
    };

    await backend.update(id, patch);

    this.logAudit({
      operation: "update",
      memoryId: id,
      agentId: updated.metadata.agentId,
      sessionKey: updated.metadata.sessionKey,
      details: { patch: Object.keys(patch) },
    });

    return updated;
  }

  async delete(id: string, permanent = false): Promise<boolean> {
    const backend = await this.findBackendForEntry(id);
    if (!backend) {
      return false;
    }

    const deleted = await backend.delete(id);

    if (deleted) {
      this.logAudit({
        operation: "delete",
        memoryId: id,
        agentId: "unknown",
        details: { permanent },
      });
    }

    return deleted;
  }

  async deleteBatch(ids: string[], permanent = false): Promise<DeleteResult> {
    const result: DeleteResult = { deleted: 0, ids: [] };

    for (const id of ids) {
      const deleted = await this.delete(id, permanent);
      if (deleted) {
        result.deleted++;
        result.ids.push(id);
      }
    }

    return result;
  }

  // ========================================================================
  // Multi-Backend Operations
  // ========================================================================

  async searchAll(query: SearchQuery): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    for (const backend of this.backends.values()) {
      try {
        const results = await backend.search(query);
        allResults.push(...results);
      } catch (err) {
        console.error(`Search failed on backend:`, err);
      }
    }

    // Sort by score and deduplicate
    allResults.sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    return allResults.filter((r) => {
      if (seen.has(r.entry.id)) return false;
      seen.add(r.entry.id);
      return true;
    });
  }

  async listBackends(): Promise<BackendInfo[]> {
    const infos: BackendInfo[] = [];

    for (const [id, backend] of this.backends) {
      try {
        const stats = await backend.stats();
        infos.push({
          id,
          name: backend.name,
          type: backend.id,
          version: backend.version,
          capabilities: {
            vectorSearch: backend.capabilities.vectorSearch,
            fullTextSearch: backend.capabilities.fullTextSearch,
            hybridSearch: backend.capabilities.hybridSearch,
            metadataFiltering: backend.capabilities.metadataFiltering,
          },
          stats: {
            entries: stats.totalEntries,
            status: "connected",
          },
        });
      } catch (err) {
        infos.push({
          id,
          name: backend.name,
          type: backend.id,
          version: backend.version,
          capabilities: {
            vectorSearch: false,
            fullTextSearch: false,
            hybridSearch: false,
            metadataFiltering: false,
          },
          stats: {
            entries: 0,
            status: "error",
          },
        });
      }
    }

    return infos;
  }

  async getBackend(backendId: string): Promise<MemoryBackendAdapter | null> {
    return this.backends.get(backendId) ?? null;
  }

  async setDefaultBackend(backendId: string): Promise<void> {
    if (!this.backends.has(backendId)) {
      throw new Error(`Backend not found: ${backendId}`);
    }
    this.config.defaultBackend = backendId;
  }

  // ========================================================================
  // Migration
  // ========================================================================

  async export(
    options: ExportOptions = {},
    backendId?: string
  ): Promise<MemoryExport> {
    const entries: MemoryEntry[] = [];

    if (backendId) {
      const backend = this.backends.get(backendId);
      if (!backend) {
        throw new Error(`Backend not found: ${backendId}`);
      }

      for await (const entry of backend.exportAll()) {
        if (options.filter && !this.matchesFilter(entry, options.filter)) {
          continue;
        }
        if (!options.includeVectors) {
          const { embedding: _, ...rest } = entry;
          entries.push(rest as MemoryEntry);
        } else {
          entries.push(entry);
        }
        if (options.limit && entries.length >= options.limit) {
          break;
        }
      }
    } else {
      // Export from all backends
      for (const backend of this.backends.values()) {
        for await (const entry of backend.exportAll()) {
          if (options.filter && !this.matchesFilter(entry, options.filter)) {
            continue;
          }
          if (!options.includeVectors) {
            const { embedding: _, ...rest } = entry;
            entries.push(rest as MemoryEntry);
          } else {
            entries.push(entry);
          }
        }
      }
    }

    return {
      entries,
      metadata: {
        exportedAt: Date.now(),
        totalCount: entries.length,
        format: options.format ?? "json",
        version: "1.0.0",
      },
    };
  }

  async import(
    data: MemoryImport,
    backendId?: string
  ): Promise<ImportResult> {
    const backend = await this.resolveBackend(backendId);
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    const toImport: MemoryEntry[] = [];

    for (const entry of data.entries) {
      // Validate if requested
      if (data.validate && !this.validateEntry(entry)) {
        result.failed++;
        result.errors.push({
          entry: entry.id,
          error: "Validation failed",
        });
        continue;
      }

      // Check for conflicts
      const existing = await backend.get(entry.id);
      if (existing) {
        switch (data.onConflict ?? "skip") {
          case "skip":
            result.skipped++;
            continue;
          case "rename":
            entry.id = randomUUID();
            break;
          case "overwrite":
            // Proceed with same ID
            break;
        }
      }

      // Set source information
      if (data.source) {
        entry.source = { ...entry.source, ...data.source };
      }

      toImport.push(entry);
    }

    // Bulk import if supported
    if (backend.capabilities.bulkImport) {
      try {
        const imported = await backend.importBatch(toImport);
        result.imported = imported;
      } catch (err) {
        result.failed += toImport.length;
        result.errors.push({
          entry: "batch",
          error: String(err),
        });
      }
    } else {
      // Individual imports
      for (const entry of toImport) {
        try {
          await backend.store(entry);
          result.imported++;
        } catch (err) {
          result.failed++;
          result.errors.push({
            entry: entry.id,
            error: String(err),
          });
        }
      }
    }

    return result;
  }

  async migrate(
    source: string,
    target: string,
    options: MigrationOptions = {}
  ): Promise<MigrationResult> {
    const sourceBackend = this.backends.get(source);
    const targetBackend = this.backends.get(target);

    if (!sourceBackend) {
      throw new Error(`Source backend not found: ${source}`);
    }
    if (!targetBackend) {
      throw new Error(`Target backend not found: ${target}`);
    }

    const result: MigrationResult = {
      success: false,
      source,
      target,
      migrated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      duration: 0,
      dryRun: options.dryRun ?? false,
    };

    const startTime = Date.now();
    let totalEntries = 0;

    // Count entries
    for await (const _ of sourceBackend.exportAll()) {
      totalEntries++;
    }

    // Export and import
    let current = 0;
    for await (const entry of sourceBackend.exportAll()) {
      current++;

      // Apply filter
      if (options.filter) {
        if (options.filter.since && entry.timestamps.created < options.filter.since) {
          continue;
        }
        if (options.filter.category && entry.metadata.category !== options.filter.category) {
          continue;
        }
        if (
          options.filter.tags &&
          !options.filter.tags.some((t) => entry.metadata.tags.includes(t))
        ) {
          continue;
        }
      }

      options.onProgress?.({
        phase: "exporting",
        current,
        total: totalEntries,
        percentage: (current / totalEntries) * 100,
      });

      if (options.dryRun) {
        result.migrated++;
        continue;
      }

      try {
        // Check for conflicts
        const existing = await targetBackend.get(entry.id);
        if (existing) {
          switch (options.onConflict ?? "skip") {
            case "skip":
              result.skipped++;
              continue;
            case "rename":
              entry.id = randomUUID();
              break;
          }
        }

        // Update source tracking
        entry.source.originalId = entry.id;
        entry.source.originalBackend = source;
        entry.source.type = "migrated";

        await targetBackend.store(entry);
        result.migrated++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          id: entry.id,
          error: String(err),
        });
      }
    }

    result.duration = Date.now() - startTime;
    result.success = result.failed === 0;

    return result;
  }

  // ========================================================================
  // Introspection
  // ========================================================================

  async stats(backendId?: string): Promise<MemoryStats> {
    if (backendId) {
      const backend = this.backends.get(backendId);
      if (!backend) {
        throw new Error(`Backend not found: ${backendId}`);
      }
      const stats = await backend.stats();
      return this.aggregateStats([stats]);
    }

    const allStats: BackendStats[] = [];
    for (const backend of this.backends.values()) {
      allStats.push(await backend.stats());
    }
    return this.aggregateStats(allStats);
  }

  async health(): Promise<HealthStatus> {
    const status: HealthStatus = {
      status: "healthy",
      backends: {},
      overall: {
        readable: true,
        writable: true,
        searchable: true,
        lastCheck: Date.now(),
      },
    };

    for (const [id, backend] of this.backends) {
      try {
        const health = await backend.health();
        status.backends[id] = health;
      } catch (err) {
        status.backends[id] = {
          status: "unhealthy",
          latency: 0,
          error: String(err),
          lastError: Date.now(),
        };
      }
    }

    // Determine overall status
    const backendStatuses = Object.values(status.backends);
    if (backendStatuses.some((b) => b.status === "unhealthy")) {
      status.status = "degraded";
    }
    if (backendStatuses.every((b) => b.status === "unhealthy")) {
      status.status = "unhealthy";
    }

    return status;
  }

  async audit(filter?: AuditFilter): Promise<AuditEntry[]> {
    let entries = [...this.auditLog];

    if (filter) {
      if (filter.since) {
        entries = entries.filter((e) => e.timestamp >= filter.since!);
      }
      if (filter.until) {
        entries = entries.filter((e) => e.timestamp <= filter.until!);
      }
      if (filter.agentId) {
        entries = entries.filter((e) => e.agentId === filter.agentId);
      }
      if (filter.operation) {
        entries = entries.filter((e) => e.operation === filter.operation);
      }
      if (filter.memoryId) {
        entries = entries.filter((e) => e.memoryId === filter.memoryId);
      }
    }

    return entries;
  }

  async explainQuery(query: SearchQuery): Promise<QueryExplanation> {
    const backend = await this.resolveBackend();
    if (backend.explain) {
      return await backend.explain(query);
    }

    // Default explanation
    return {
      query,
      backend: backend.name,
      strategy: "unknown",
      steps: [{ operation: "search", description: "Execute search", estimatedCost: 1 }],
      estimatedCost: 1,
      estimatedTimeMs: 100,
    };
  }

  async findSimilar(id: string, threshold = 0.9): Promise<SimilarityCluster> {
    const entry = await this.get(id);
    if (!entry || !entry.embedding) {
      throw new Error(`Memory not found or has no embedding: ${id}`);
    }

    const results: SearchResult[] = [];

    for (const backend of this.backends.values()) {
      if (backend.findSimilar) {
        const similar = await backend.findSimilar(entry.embedding, 20, threshold);
        results.push(...similar);
      } else if (backend.capabilities.vectorSearch) {
        const similar = await backend.search({
          vector: entry.embedding,
          limit: 20,
          minScore: threshold,
        });
        results.push(...similar);
      }
    }

    // Sort and deduplicate
    results.sort((a, b) => b.score - a.score);

    const seen = new Set<string>([id]);
    const neighbors = results
      .filter((r) => {
        if (seen.has(r.entry.id)) return false;
        seen.add(r.entry.id);
        return true;
      })
      .map((r) => ({ entry: r.entry, score: r.score }));

    return {
      center: entry,
      neighbors,
    };
  }

  async detectDuplicates(threshold = 0.95): Promise<PotentialDuplicate[]> {
    const duplicates: PotentialDuplicate[] = [];

    // Get all entries with embeddings
    const entries: MemoryEntry[] = [];
    for (const backend of this.backends.values()) {
      for await (const entry of backend.exportAll()) {
        if (entry.embedding) {
          entries.push(entry);
        }
      }
    }

    // O(n²) comparison - for smaller datasets
    // For larger datasets, use LSH or similar
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];

        if (!a.embedding || !b.embedding) continue;

        const similarity = this.cosineSimilarity(a.embedding, b.embedding);
        if (similarity >= threshold) {
          duplicates.push({
            entries: [a, b],
            similarity,
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  async getByTag(tag: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    for (const backend of this.backends.values()) {
      const matches = await backend.search({
        filter: { tags: { $contains: tag } },
        limit: 1000,
      });
      results.push(...matches.map((m) => m.entry));
    }

    return results;
  }

  async getByCategory(category: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    for (const backend of this.backends.values()) {
      const matches = await backend.search({
        filter: { category: { $eq: category } },
        limit: 1000,
      });
      results.push(...matches.map((m) => m.entry));
    }

    return results;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private mergeConfig(config: UnifiedMemoryConfig): UnifiedMemoryConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      migration: { ...DEFAULT_CONFIG.migration, ...config.migration },
      introspection: { ...DEFAULT_CONFIG.introspection, ...config.introspection },
      autoCapture: { ...DEFAULT_CONFIG.autoCapture, ...config.autoCapture },
      autoRecall: { ...DEFAULT_CONFIG.autoRecall, ...config.autoRecall },
      cache: { ...DEFAULT_CONFIG.cache, ...config.cache },
      logging: { ...DEFAULT_CONFIG.logging, ...config.logging },
    } as UnifiedMemoryConfig;
  }

  private async resolveBackend(backendId?: string): Promise<MemoryBackendAdapter> {
    const id = backendId ?? this.config.defaultBackend;
    const backend = this.backends.get(id);
    if (!backend) {
      throw new Error(`Backend not found: ${id}`);
    }
    return backend;
  }

  private async findBackendForEntry(
    id: string
  ): Promise<MemoryBackendAdapter | null> {
    for (const backend of this.backends.values()) {
      if (await backend.exists(id)) {
        return backend;
      }
    }
    return null;
  }

  private async findEntryInAnyBackend(id: string): Promise<MemoryEntry | null> {
    for (const backend of this.backends.values()) {
      const entry = await backend.get(id);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  private createMemoryEntry(input: StoreInput): MemoryEntry {
    const now = Date.now();

    return {
      id: randomUUID(),
      content: input.content,
      embedding: input.embedding,
      metadata: {
        category: input.metadata?.category ?? "other",
        importance: input.metadata?.importance ?? 0.5,
        tags: input.metadata?.tags ?? [],
        agentId: input.metadata?.agentId ?? "default",
        sessionKey: input.metadata?.sessionKey,
        custom: input.metadata?.custom ?? {},
      },
      timestamps: {
        created: now,
        updated: now,
      },
      source: {
        type: input.source?.type ?? "manual",
        tool: input.source?.tool,
      },
    };
  }

  private logAudit(entry: Omit<AuditEntry, "id" | "timestamp">): void {
    if (!this.config.introspection?.auditLog) {
      return;
    }

    this.auditLog.push({
      id: randomUUID(),
      timestamp: Date.now(),
      ...entry,
    });

    // Trim audit log if needed
    const maxEntries = this.config.introspection?.maxAuditEntries ?? 10000;
    if (this.auditLog.length > maxEntries) {
      this.auditLog = this.auditLog.slice(-maxEntries);
    }
  }

  private matchesFilter(entry: MemoryEntry, filter: unknown): boolean {
    // Simple filter implementation - would be more sophisticated in production
    return true;
  }

  private validateEntry(entry: MemoryEntry): boolean {
    return (
      typeof entry.id === "string" &&
      typeof entry.content === "string" &&
      entry.content.length > 0 &&
      typeof entry.metadata === "object"
    );
  }

  private aggregateStats(backendStats: BackendStats[]): MemoryStats {
    const byCategory: Record<MemoryCategory, number> = {
      preference: 0,
      fact: 0,
      decision: 0,
      entity: 0,
      other: 0,
    };

    return {
      totalEntries: backendStats.reduce((sum, s) => sum + s.totalEntries, 0),
      byCategory,
      bySource: {},
      byAgent: {},
      averageImportance: 0.5,
      storageUsed: backendStats.reduce((sum, s) => sum + s.storageSize, 0),
      indexSize: backendStats.reduce((sum, s) => sum + s.indexSize, 0),
      lastSync: Date.now(),
      backendSpecific: {},
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private startHealthChecks(): void {
    const interval = this.config.introspection?.healthCheckInterval ?? 5 * 60 * 1000;

    this.healthCheckTimer = setInterval(async () => {
      await this.health();
    }, interval);
  }
}

// Re-export for convenience
export { MemoryService as UnifiedMemoryService };
