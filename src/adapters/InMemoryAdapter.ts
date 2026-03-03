/**
 * In-Memory Backend Adapter
 * 
 * A simple in-memory adapter for testing and development.
 * Not suitable for production use.
 */

import type {
  BackendCapabilities,
  BackendConfig,
  BackendStats,
  MemoryBackendAdapter,
  QueryExplanation,
} from "./types.js";
import type {
  FilterExpression,
  HealthStatus,
  MemoryEntry,
  SearchQuery,
  SearchResult,
  UpdatePatch,
} from "../types.js";

export interface InMemoryAdapterConfig {
  /** Max entries before eviction */
  maxEntries?: number;
  
  /** Simulate latency (ms) */
  latency?: number;
}

export class InMemoryAdapter implements MemoryBackendAdapter {
  readonly id = "memory";
  readonly name = "In-Memory Adapter";
  readonly version = "1.0.0";
  
  readonly capabilities: BackendCapabilities = {
    vectorSearch: true,
    fullTextSearch: true,
    hybridSearch: true,
    metadataFiltering: true,
    bulkImport: true,
    ttl: false,
    transactions: false,
    maxDimensions: 1536,
    nativeEmbeddings: false,
  };

  private entries = new Map<string, MemoryEntry>();
  private config: InMemoryAdapterConfig;

  constructor(config: InMemoryAdapterConfig = {}) {
    this.config = {
      maxEntries: 10000,
      latency: 0,
      ...config,
    };
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  async initialize(_config: unknown): Promise<void> {
    // No initialization needed for in-memory
  }

  async close(): Promise<void> {
    this.entries.clear();
  }

  // ========================================================================
  // Core Operations
  // ========================================================================

  async store(entry: MemoryEntry): Promise<void> {
    await this.simulateLatency();
    
    // Evict oldest if at capacity
    if (this.entries.size >= (this.config.maxEntries ?? 10000)) {
      const oldest = this.findOldest();
      if (oldest) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(entry.id, entry);
  }

  async storeBatch(entries: MemoryEntry[]): Promise<number> {
    await this.simulateLatency();
    
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
    
    return entries.length;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    await this.simulateLatency();
    return this.entries.get(id) ?? null;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    await this.simulateLatency();

    let results: SearchResult[] = [];

    // Vector search
    if (query.vector && this.capabilities.vectorSearch) {
      results = this.searchByVector(query.vector, query.limit ?? 10, query.minScore ?? 0.5);
    }
    // Text search
    else if (query.text) {
      results = this.searchByText(query.text, query.limit ?? 10, query.minScore ?? 0.1);
    }
    // Filter-only search
    else if (query.filter) {
      results = this.searchByFilter(query.filter, query.limit ?? 100);
    }
    // No criteria - return recent entries
    else {
      results = Array.from(this.entries.values())
        .sort((a, b) => b.timestamps.created - a.timestamps.created)
        .slice(0, query.limit ?? 10)
        .map((entry) => ({
          entry,
          score: 1,
          method: "exact" as const,
        }));
    }

    // Apply filter if specified alongside text/vector
    if (query.filter && (query.text || query.vector)) {
      results = results.filter((r) => this.matchesFilter(r.entry, query.filter!));
    }

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    // Include vectors if requested
    if (!query.includeVectors) {
      results = results.map((r) => ({
        ...r,
        entry: { ...r.entry, embedding: undefined },
      }));
    }

    return results;
  }

  async update(id: string, patch: UpdatePatch): Promise<void> {
    await this.simulateLatency();

    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Memory not found: ${id}`);
    }

    const updated: MemoryEntry = {
      ...existing,
      content: patch.content ?? existing.content,
      embedding: patch.embedding ?? existing.embedding,
      metadata: patch.mergeMetadata
        ? { ...existing.metadata, ...(patch.metadata as MemoryEntry["metadata"]) }
        : { ...existing.metadata, ...(patch.metadata ?? {}) },
      timestamps: {
        ...existing.timestamps,
        updated: Date.now(),
      },
    };

    this.entries.set(id, updated);
  }

  async delete(id: string): Promise<boolean> {
    await this.simulateLatency();
    return this.entries.delete(id);
  }

  async deleteBatch(ids: string[]): Promise<number> {
    await this.simulateLatency();
    
    let count = 0;
    for (const id of ids) {
      if (this.entries.delete(id)) {
        count++;
      }
    }
    return count;
  }

  async count(filter?: FilterExpression): Promise<number> {
    await this.simulateLatency();

    if (!filter) {
      return this.entries.size;
    }

    let count = 0;
    for (const entry of this.entries.values()) {
      if (this.matchesFilter(entry, filter)) {
        count++;
      }
    }
    return count;
  }

  async exists(id: string): Promise<boolean> {
    await this.simulateLatency();
    return this.entries.has(id);
  }

  // ========================================================================
  // Migration Support
  // ========================================================================

  async *exportAll(): AsyncIterable<MemoryEntry> {
    for (const entry of this.entries.values()) {
      yield entry;
    }
  }

  async importBatch(entries: MemoryEntry[]): Promise<number> {
    await this.simulateLatency();
    
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
    
    return entries.length;
  }

  // ========================================================================
  // Introspection
  // ========================================================================

  async stats(): Promise<BackendStats> {
    await this.simulateLatency();

    let storageSize = 0;
    for (const entry of this.entries.values()) {
      storageSize += JSON.stringify(entry).length * 2; // Rough estimate
    }

    return {
      totalEntries: this.entries.size,
      storageSize,
      indexSize: 0,
      lastModified: Date.now(),
      custom: {
        maxEntries: this.config.maxEntries,
      },
    };
  }

  async health(): Promise<HealthStatus> {
    return {
      status: "healthy",
      backends: {
        memory: {
          status: "healthy",
          latency: this.config.latency ?? 0,
        },
      },
      overall: {
        readable: true,
        writable: true,
        searchable: true,
        lastCheck: Date.now(),
      },
    };
  }

  async explain(query: SearchQuery): Promise<QueryExplanation> {
    const steps = [];

    if (query.vector) {
      steps.push({
        operation: "vector_search",
        description: `Scan ${this.entries.size} entries for vector similarity`,
        estimatedCost: this.entries.size,
      });
    }

    if (query.text) {
      steps.push({
        operation: "text_search",
        description: `Full-text search for "${query.text}"`,
        estimatedCost: this.entries.size * 0.5,
      });
    }

    if (query.filter) {
      steps.push({
        operation: "filter",
        description: "Apply metadata filter",
        estimatedCost: this.entries.size * 0.1,
      });
    }

    return {
      query,
      backend: this.name,
      strategy: query.vector ? "vector_scan" : query.text ? "text_scan" : "filter_scan",
      steps,
      estimatedCost: steps.reduce((sum, s) => sum + s.estimatedCost, 0),
      estimatedTimeMs: (this.config.latency ?? 0) + this.entries.size * 0.01,
    };
  }

  async findSimilar(
    vector: number[],
    limit: number,
    minScore = 0.5
  ): Promise<SearchResult[]> {
    return this.searchByVector(vector, limit, minScore);
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private async simulateLatency(): Promise<void> {
    if (this.config.latency) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latency));
    }
  }

  private findOldest(): string | null {
    let oldest: { id: string; timestamp: number } | null = null;

    for (const [id, entry] of this.entries) {
      if (!oldest || entry.timestamps.created < oldest.timestamp) {
        oldest = { id, timestamp: entry.timestamps.created };
      }
    }

    return oldest?.id ?? null;
  }

  private searchByVector(
    vector: number[],
    limit: number,
    minScore: number
  ): SearchResult[] {
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (!entry.embedding) continue;

      const similarity = this.cosineSimilarity(vector, entry.embedding);
      if (similarity >= minScore) {
        results.push({
          entry,
          score: similarity,
          method: "vector",
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private searchByText(
    text: string,
    limit: number,
    minScore: number
  ): SearchResult[] {
    const queryTerms = text.toLowerCase().split(/\s+/);
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      const contentLower = entry.content.toLowerCase();
      let matches = 0;

      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          matches++;
        }
      }

      const score = matches / queryTerms.length;
      if (score >= minScore) {
        results.push({
          entry,
          score,
          method: "fts",
          highlights: this.extractHighlights(entry.content, queryTerms),
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private searchByFilter(
    filter: FilterExpression,
    limit: number
  ): SearchResult[] {
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (this.matchesFilter(entry, filter)) {
        results.push({
          entry,
          score: 1,
          method: "exact",
        });

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  }

  private matchesFilter(entry: MemoryEntry, filter: FilterExpression): boolean {
    // Handle AND
    if ("$and" in filter) {
      return filter.$and.every((f) => this.matchesFilter(entry, f));
    }

    // Handle OR
    if ("$or" in filter) {
      return filter.$or.some((f) => this.matchesFilter(entry, f));
    }

    // Handle NOT
    if ("$not" in filter) {
      return !this.matchesFilter(entry, filter.$not);
    }

    // Handle field comparisons
    for (const [field, condition] of Object.entries(filter)) {
      const value = this.getFieldValue(entry, field);

      if (typeof condition === "object" && condition !== null) {
        // Complex condition
        if ("$eq" in condition && value !== condition.$eq) return false;
        if ("$ne" in condition && value === condition.$ne) return false;
        if ("$gt" in condition && !(value > condition.$gt)) return false;
        if ("$gte" in condition && !(value >= condition.$gte)) return false;
        if ("$lt" in condition && !(value < condition.$lt)) return false;
        if ("$lte" in condition && !(value <= condition.$lte)) return false;
        if ("$in" in condition && !condition.$in.includes(value)) return false;
        if ("$contains" in condition && Array.isArray(value)) {
          if (!value.includes(condition.$contains)) return false;
        }
      } else {
        // Simple equality
        if (value !== condition) return false;
      }
    }

    return true;
  }

  private getFieldValue(entry: MemoryEntry, field: string): unknown {
    const parts = field.split(".");
    let value: unknown = entry;

    for (const part of parts) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private extractHighlights(content: string, terms: string[]): string[] {
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (terms.some((t) => lower.includes(t))) {
        highlights.push(sentence.trim());
      }
    }

    return highlights.slice(0, 3);
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
}
