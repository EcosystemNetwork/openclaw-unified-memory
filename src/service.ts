/**
 * Unified Memory Service
 * 
 * The main interface for interacting with the memory system.
 * Provides a consistent API regardless of underlying backends.
 */

import type {
  AuditEntry,
  AuditFilter,
  DeleteResult,
  ExportOptions,
  HealthStatus,
  ImportResult,
  MemoryEntry,
  MemoryExport,
  MemoryImport,
  MemoryStats,
  PotentialDuplicate,
  QueryExplanation,
  SearchQuery,
  SearchResult,
  SimilarityCluster,
  StoreBatchInput,
  StoreInput,
  UpdatePatch,
} from "./types.js";
import type { BackendConfig, MemoryBackendAdapter } from "./adapters/types.js";

// ============================================================================
// Service Configuration
// ============================================================================

export interface UnifiedMemoryConfig {
  /** Enable the unified memory service */
  enabled: boolean;
  
  /** Default backend to use for operations */
  defaultBackend: string;
  
  /** Backend configurations */
  backends: BackendConfig[];
  
  /** Migration settings */
  migration?: MigrationSettings;
  
  /** Introspection settings */
  introspection?: IntrospectionSettings;
  
  /** Auto-capture settings */
  autoCapture?: AutoCaptureSettings;
  
  /** Auto-recall settings */
  autoRecall?: AutoRecallSettings;
  
  /** Cache settings */
  cache?: CacheSettings;
  
  /** Logging settings */
  logging?: LoggingSettings;
}

export interface MigrationSettings {
  /** Automatically migrate on startup */
  autoMigrate: boolean;
  
  /** Source backend for migration */
  source?: string;
  
  /** Target backend for migration */
  target?: string;
  
  /** Create backup before migration */
  backupBeforeMigrate: boolean;
  
  /** Migration conflict resolution */
  conflictResolution: "skip" | "overwrite" | "rename";
}

export interface IntrospectionSettings {
  /** Enable audit logging */
  auditLog: boolean;
  
  /** Log queries for analysis */
  queryLogging: boolean;
  
  /** Collect statistics */
  statsCollection: boolean;
  
  /** Health check interval in ms */
  healthCheckInterval: number;
  
  /** Maximum audit log entries */
  maxAuditEntries?: number;
}

export interface AutoCaptureSettings {
  /** Enable automatic memory capture */
  enabled: boolean;
  
  /** Maximum message length to consider */
  maxChars: number;
  
  /** Regex patterns that trigger capture */
  triggers: string[];
  
  /** Minimum importance for auto-captured memories */
  minImportance: number;
}

export interface AutoRecallSettings {
  /** Enable automatic memory recall */
  enabled: boolean;
  
  /** Maximum memories to inject */
  maxMemories: number;
  
  /** Minimum similarity score */
  minScore: number;
  
  /** Format template for injected context */
  formatTemplate?: string;
}

export interface CacheSettings {
  /** Enable result caching */
  enabled: boolean;
  
  /** Maximum cache entries */
  maxEntries: number;
  
  /** TTL in ms */
  ttl: number;
}

export interface LoggingSettings {
  /** Log level */
  level: "debug" | "info" | "warn" | "error";
  
  /** Log slow queries (>ms) */
  slowQueryThreshold?: number;
}

// ============================================================================
// Unified Memory Service Interface
// ============================================================================

export interface UnifiedMemoryService {
  // ========================================================================
  // Core Operations
  // ========================================================================
  
  /**
   * Store a single memory entry
   * 
   * @param input - Memory to store
   * @param backendId - Optional backend override
   * @returns The stored memory with generated fields
   */
  store(input: StoreInput, backendId?: string): Promise<MemoryEntry>;
  
  /**
   * Store multiple memories efficiently
   * 
   * @param input - Batch of memories to store
   * @param backendId - Optional backend override
   * @returns Array of stored memories
   */
  storeBatch(input: StoreBatchInput, backendId?: string): Promise<MemoryEntry[]>;
  
  /**
   * Search for memories
   * 
   * @param query - Search query
   * @returns Array of search results
   */
  search(query: SearchQuery): Promise<SearchResult[]>;
  
  /**
   * Get a memory by ID
   * 
   * @param id - Memory ID
   * @returns Memory entry or null if not found
   */
  get(id: string): Promise<MemoryEntry | null>;
  
  /**
   * Update an existing memory
   * 
   * @param id - Memory ID
   * @param patch - Fields to update
   * @returns Updated memory entry
   */
  update(id: string, patch: UpdatePatch): Promise<MemoryEntry>;
  
  /**
   * Delete a memory by ID
   * 
   * @param id - Memory ID
   * @param permanent - If true, permanently delete
   * @returns True if deleted
   */
  delete(id: string, permanent?: boolean): Promise<boolean>;
  
  /**
   * Delete multiple memories
   * 
   * @param ids - Array of memory IDs
   * @param permanent - If true, permanently delete
   * @returns Delete result with counts
   */
  deleteBatch(ids: string[], permanent?: boolean): Promise<DeleteResult>;
  
  // ========================================================================
  // Multi-Backend Operations
  // ========================================================================
  
  /**
   * Search across all backends
   * 
   * @param query - Search query
   * @returns Combined results from all backends
   */
  searchAll(query: SearchQuery): Promise<SearchResult[]>;
  
  /**
   * List all configured backends
   */
  listBackends(): Promise<BackendInfo[]>;
  
  /**
   * Get a specific backend adapter
   * 
   * @param backendId - Backend identifier
   * @returns Backend adapter or null
   */
  getBackend(backendId: string): Promise<MemoryBackendAdapter | null>;
  
  /**
   * Set the default backend
   * 
   * @param backendId - Backend to set as default
   */
  setDefaultBackend(backendId: string): Promise<void>;
  
  // ========================================================================
  // Migration
  // ========================================================================
  
  /**
   * Export memories from a backend
   * 
   * @param options - Export options
   * @param backendId - Source backend (default: all)
   * @returns Exported memories
   */
  export(options?: ExportOptions, backendId?: string): Promise<MemoryExport>;
  
  /**
   * Import memories to a backend
   * 
   * @param data - Memories to import
   * @param backendId - Target backend (default: defaultBackend)
   * @returns Import result
   */
  import(data: MemoryImport, backendId?: string): Promise<ImportResult>;
  
  /**
   * Migrate memories between backends
   * 
   * @param source - Source backend ID
   * @param target - Target backend ID
   * @param options - Migration options
   * @returns Migration result
   */
  migrate(
    source: string,
    target: string,
    options?: MigrationOptions
  ): Promise<MigrationResult>;
  
  // ========================================================================
  // Introspection
  // ========================================================================
  
  /**
   * Get memory statistics
   * 
   * @param backendId - Optional backend filter
   * @returns Statistics summary
   */
  stats(backendId?: string): Promise<MemoryStats>;
  
  /**
   * Get health status
   * 
   * @returns Health status for all backends
   */
  health(): Promise<HealthStatus>;
  
  /**
   * Query audit log
   * 
   * @param filter - Audit filter
   * @returns Matching audit entries
   */
  audit(filter?: AuditFilter): Promise<AuditEntry[]>;
  
  /**
   * Explain how a query would be executed
   * 
   * @param query - Search query
   * @returns Query explanation
   */
  explainQuery(query: SearchQuery): Promise<QueryExplanation>;
  
  /**
   * Find similar memories to a given entry
   * 
   * @param id - Memory ID
   * @param threshold - Similarity threshold (0-1)
   * @returns Cluster of similar memories
   */
  findSimilar(id: string, threshold?: number): Promise<SimilarityCluster>;
  
  /**
   * Detect potential duplicate memories
   * 
   * @param threshold - Similarity threshold (0-1)
   * @returns Array of potential duplicates
   */
  detectDuplicates(threshold?: number): Promise<PotentialDuplicate[]>;
  
  /**
   * Get memories by tag
   * 
   * @param tag - Tag to search for
   * @returns Matching memories
   */
  getByTag(tag: string): Promise<MemoryEntry[]>;
  
  /**
   * Get memories by category
   * 
   * @param category - Category to filter by
   * @returns Matching memories
   */
  getByCategory(category: string): Promise<MemoryEntry[]>;
  
  // ========================================================================
  // Lifecycle
  // ========================================================================
  
  /**
   * Initialize the service
   */
  initialize(): Promise<void>;
  
  /**
   * Close the service and all backends
   */
  close(): Promise<void>;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface BackendInfo {
  id: string;
  name: string;
  type: string;
  version: string;
  capabilities: {
    vectorSearch: boolean;
    fullTextSearch: boolean;
    hybridSearch: boolean;
    metadataFiltering: boolean;
  };
  stats: {
    entries: number;
    status: "connected" | "disconnected" | "error";
  };
}

export interface MigrationOptions {
  /** Filter which memories to migrate */
  filter?: {
    since?: number;
    category?: string;
    tags?: string[];
  };
  
  /** How to handle ID conflicts */
  onConflict?: "skip" | "overwrite" | "rename";
  
  /** Verify after migration */
  verify?: boolean;
  
  /** Dry run (don't actually migrate) */
  dryRun?: boolean;
  
  /** Progress callback */
  onProgress?: (progress: MigrationProgress) => void;
}

export interface MigrationProgress {
  phase: "analyzing" | "exporting" | "transforming" | "importing" | "verifying";
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

export interface MigrationResult {
  success: boolean;
  source: string;
  target: string;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
  duration: number;
  dryRun?: boolean;
}
