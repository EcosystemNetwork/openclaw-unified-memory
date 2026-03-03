/**
 * Core types for the Unified Memory Interface (UMI)
 */

// ============================================================================
// Memory Categories
// ============================================================================

export const MEMORY_CATEGORIES = [
  "preference",
  "fact", 
  "decision",
  "entity",
  "other"
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

// ============================================================================
// Core Memory Entry
// ============================================================================

/**
 * Universal memory entry format - all backends must be able to
 * read/write this structure
 */
export interface MemoryEntry {
  /** UUID v4 unique identifier */
  id: string;
  
  /** Text content of the memory */
  content: string;
  
  /** Optional vector embedding (if backend supports vectors) */
  embedding?: number[];
  
  /** Metadata about the memory */
  metadata: MemoryMetadata;
  
  /** Timestamp information */
  timestamps: Timestamps;
  
  /** Source information for audit/debugging */
  source: MemorySource;
}

export interface MemoryMetadata {
  /** Classification category */
  category: MemoryCategory;
  
  /** Importance score 0.0 - 1.0 */
  importance: number;
  
  /** User-defined tags */
  tags: string[];
  
  /** Originating agent ID */
  agentId: string;
  
  /** Optional session context */
  sessionKey?: string;
  
  /** Backend-specific extensions */
  custom: Record<string, unknown>;
}

export interface Timestamps {
  /** Unix timestamp (ms) when created */
  created: number;
  
  /** Unix timestamp (ms) last modified */
  updated: number;
  
  /** Unix timestamp (ms) last accessed (optional) */
  accessed?: number;
  
  /** Unix timestamp (ms) when memory expires (optional) */
  expires?: number;
}

export interface MemorySource {
  /** How this memory was created */
  type: "auto" | "manual" | "imported" | "migrated";
  
  /** Tool that created the memory (e.g., "memory_store", "auto_capture") */
  tool?: string;
  
  /** Original ID from source system (for migration tracking) */
  originalId?: string;
  
  /** Source backend ID (for migrations) */
  originalBackend?: string;
}

// ============================================================================
// Store Operations
// ============================================================================

export interface StoreInput {
  content: string;
  embedding?: number[];
  metadata?: Partial<MemoryMetadata> & { category?: MemoryCategory };
  source?: Partial<MemorySource>;
}

export interface StoreBatchInput {
  entries: StoreInput[];
  /** If true, fail entire batch on any error */
  atomic?: boolean;
}

// ============================================================================
// Search Operations
// ============================================================================

export interface SearchQuery {
  /** Text query for semantic search (requires embedding) */
  text?: string;
  
  /** Direct vector query */
  vector?: number[];
  
  /** 
   * Metadata filter expression.
   * Examples:
   * - { category: "preference" }
   * - { importance: { $gte: 0.8 } }
   * - { tags: { $contains: "urgent" } }
   */
  filter?: FilterExpression;
  
  /** Maximum results to return */
  limit?: number;
  
  /** Minimum similarity score (0-1) */
  minScore?: number;
  
  /** Include vector embeddings in results */
  includeVectors?: boolean;
  
  /** Sort order */
  sort?: SortOptions;
}

export type FilterExpression = 
  | Record<string, FilterValue>
  | { $and: FilterExpression[] }
  | { $or: FilterExpression[] }
  | { $not: FilterExpression };

export type FilterValue = 
  | string 
  | number 
  | boolean 
  | null
  | { $eq: unknown }
  | { $ne: unknown }
  | { $gt: number }
  | { $gte: number }
  | { $lt: number }
  | { $lte: number }
  | { $in: unknown[] }
  | { $contains: string }
  | { $startsWith: string }
  | { $endsWith: string }
  | { $regex: string };

export interface SortOptions {
  field: "created" | "updated" | "importance" | "score";
  direction: "asc" | "desc";
}

export interface SearchResult {
  /** The matched memory entry */
  entry: MemoryEntry;
  
  /** Similarity score (0-1) */
  score: number;
  
  /** Matched text segments for highlighting */
  highlights?: string[];
  
  /** Search method used (vector, fts, hybrid) */
  method?: "vector" | "fts" | "hybrid" | "exact";
}

// ============================================================================
// Update Operations
// ============================================================================

export interface UpdatePatch {
  content?: string;
  embedding?: number[];
  metadata?: Partial<MemoryMetadata>;
  mergeMetadata?: boolean; // If true, merge with existing metadata
}

// ============================================================================
// Delete Operations
// ============================================================================

export interface DeleteOptions {
  /** If true, permanently delete (otherwise soft-delete) */
  permanent?: boolean;
}

export interface DeleteResult {
  deleted: number;
  ids: string[];
}

// ============================================================================
// Export/Import
// ============================================================================

export interface ExportOptions {
  /** Filter memories to export */
  filter?: FilterExpression;
  
  /** Include vector embeddings */
  includeVectors?: boolean;
  
  /** Output format */
  format?: "jsonl" | "json" | "parquet";
  
  /** Maximum entries to export */
  limit?: number;
}

export interface MemoryExport {
  entries: MemoryEntry[];
  metadata: {
    exportedAt: number;
    totalCount: number;
    format: string;
    version: string;
  };
}

export interface MemoryImport {
  entries: MemoryEntry[];
  
  /** How to handle ID conflicts */
  onConflict?: "skip" | "overwrite" | "rename";
  
  /** Validate entries before import */
  validate?: boolean;
  
  /** Source information for all entries */
  source?: Partial<MemorySource>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ entry: string; error: string }>;
}

// ============================================================================
// Statistics & Health
// ============================================================================

export interface MemoryStats {
  totalEntries: number;
  byCategory: Record<MemoryCategory, number>;
  bySource: Record<string, number>;
  byAgent: Record<string, number>;
  averageImportance: number;
  storageUsed: number; // bytes
  indexSize: number; // bytes
  lastSync: number;
  backendSpecific: Record<string, unknown>;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  backends: Record<string, BackendHealth>;
  overall: {
    readable: boolean;
    writable: boolean;
    searchable: boolean;
    lastCheck: number;
  };
}

export interface BackendHealth {
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latency: number; // ms
  error?: string;
  lastError?: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// Audit & Introspection
// ============================================================================

export interface AuditFilter {
  since?: number;
  until?: number;
  agentId?: string;
  sessionKey?: string;
  operation?: "create" | "update" | "delete" | "search";
  memoryId?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  operation: "create" | "update" | "delete" | "search" | "migrate";
  agentId: string;
  sessionKey?: string;
  memoryId?: string;
  details: Record<string, unknown>;
}

export interface QueryExplanation {
  query: SearchQuery;
  plan: QueryPlan;
  estimatedCost: number;
  estimatedResults: number;
}

export interface QueryPlan {
  steps: QueryStep[];
  indexesUsed: string[];
  optimizations: string[];
}

export interface QueryStep {
  operation: string;
  description: string;
  estimatedCost: number;
}

export interface SimilarityCluster {
  center: MemoryEntry;
  neighbors: Array<{ entry: MemoryEntry; score: number }>;
}

export interface PotentialDuplicate {
  entries: [MemoryEntry, MemoryEntry];
  similarity: number;
}
