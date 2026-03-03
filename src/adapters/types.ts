/**
 * Backend Adapter Interface
 * 
 * All memory backends must implement this interface to be compatible
 * with the Unified Memory Service.
 */

import type {
  FilterExpression,
  HealthStatus,
  MemoryEntry,
  SearchQuery,
  SearchResult,
  UpdatePatch,
} from "../types.js";

// ============================================================================
// Backend Capabilities
// ============================================================================

export interface BackendCapabilities {
  /** Supports vector similarity search */
  vectorSearch: boolean;
  
  /** Supports full-text search */
  fullTextSearch: boolean;
  
  /** Supports hybrid (vector + text) search */
  hybridSearch: boolean;
  
  /** Supports filtering by metadata fields */
  metadataFiltering: boolean;
  
  /** Supports efficient bulk import */
  bulkImport: boolean;
  
  /** Supports TTL / expiration */
  ttl: boolean;
  
  /** Supports transactions */
  transactions: boolean;
  
  /** Maximum vector dimensions supported */
  maxDimensions?: number;
  
  /** Native embedding generation (vs external) */
  nativeEmbeddings?: boolean;
}

// ============================================================================
// Backend Configuration
// ============================================================================

export interface BackendConfig {
  /** Unique identifier for this backend instance */
  id: string;
  
  /** Backend type identifier */
  type: string;
  
  /** Human-readable name */
  name?: string;
  
  /** Backend-specific configuration */
  config: unknown;
  
  /** Whether this backend is read-only */
  readOnly?: boolean;
  
  /** Priority for fallback ordering (lower = higher priority) */
  priority?: number;
}

// ============================================================================
// Backend Adapter Interface
// ============================================================================

export interface MemoryBackendAdapter {
  /** Backend identifier */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Version string */
  readonly version: string;
  
  /** What this backend can do */
  readonly capabilities: BackendCapabilities;
  
  // ========================================================================
  // Lifecycle
  // ========================================================================
  
  /**
   * Initialize the backend with configuration
   */
  initialize(config: unknown): Promise<void>;
  
  /**
   * Close the backend and release resources
   */
  close(): Promise<void>;
  
  // ========================================================================
  // Core CRUD Operations
  // ========================================================================
  
  /**
   * Store a single memory entry
   */
  store(entry: MemoryEntry): Promise<void>;
  
  /**
   * Store multiple entries efficiently
   */
  storeBatch(entries: MemoryEntry[]): Promise<number>;
  
  /**
   * Retrieve a memory by ID
   */
  get(id: string): Promise<MemoryEntry | null>;
  
  /**
   * Search for memories
   */
  search(query: SearchQuery): Promise<SearchResult[]>;
  
  /**
   * Update an existing memory
   */
  update(id: string, patch: UpdatePatch): Promise<void>;
  
  /**
   * Delete a memory by ID
   */
  delete(id: string): Promise<boolean>;
  
  /**
   * Delete multiple memories
   */
  deleteBatch(ids: string[]): Promise<number>;
  
  /**
   * Count memories matching filter
   */
  count(filter?: FilterExpression): Promise<number>;
  
  /**
   * Check if a memory exists
   */
  exists(id: string): Promise<boolean>;
  
  // ========================================================================
  // Migration Support
  // ========================================================================
  
  /**
   * Stream all entries for export
   */
  exportAll(): AsyncIterable<MemoryEntry>;
  
  /**
   * Import a batch of entries
   */
  importBatch(entries: MemoryEntry[]): Promise<number>;
  
  // ========================================================================
  // Introspection
  // ========================================================================
  
  /**
   * Get backend statistics
   */
  stats(): Promise<BackendStats>;
  
  /**
   * Get backend health status
   */
  health(): Promise<HealthStatus>;
  
  /**
   * Explain how a query would be executed
   */
  explain?(query: SearchQuery): Promise<QueryExplanation>;
  
  /**
   * Get similar entries to a given vector
   */
  findSimilar?(vector: number[], limit: number, minScore?: number): Promise<SearchResult[]>;
}

// ============================================================================
// Backend Statistics
// ============================================================================

export interface BackendStats {
  totalEntries: number;
  storageSize: number; // bytes
  indexSize: number;   // bytes
  lastModified: number;
  
  /** Backend-specific statistics */
  custom: Record<string, unknown>;
}

// ============================================================================
// Query Explanation
// ============================================================================

export interface QueryExplanation {
  query: SearchQuery;
  backend: string;
  strategy: string;
  steps: QueryStep[];
  estimatedCost: number;
  estimatedTimeMs: number;
}

export interface QueryStep {
  operation: string;
  description: string;
  estimatedCost: number;
}

// ============================================================================
// Adapter Factory
// ============================================================================

export interface AdapterFactory {
  /** Backend type this factory creates */
  readonly type: string;
  
  /** Create a new adapter instance */
  create(config: unknown): Promise<MemoryBackendAdapter>;
  
  /** Validate configuration */
  validateConfig(config: unknown): { valid: boolean; errors?: string[] };
}

// ============================================================================
// Adapter Registry
// ============================================================================

export interface AdapterRegistry {
  /** Register an adapter factory */
  register(factory: AdapterFactory): void;
  
  /** Unregister an adapter factory */
  unregister(type: string): void;
  
  /** Create an adapter by type */
  create(type: string, config: unknown): Promise<MemoryBackendAdapter>;
  
  /** Check if a type is registered */
  has(type: string): boolean;
  
  /** List registered types */
  list(): string[];
}
