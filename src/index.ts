/**
 * Unified Memory Interface (UMI) for OpenClaw
 * 
 * A unified, backend-agnostic memory system supporting:
 * - Multiple storage backends (vector DBs, SQLite, file-based)
 * - Seamless data migration between backends
 * - Comprehensive introspection and debugging tools
 */

// Core types
export type {
  AuditEntry,
  AuditFilter,
  DeleteResult,
  ExportOptions,
  FilterExpression,
  FilterValue,
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
  QueryPlan,
  QueryStep,
  SearchQuery,
  SearchResult,
  SimilarityCluster,
  SortOptions,
  StoreBatchInput,
  StoreInput,
  Timestamps,
  UpdatePatch,
} from "./types.js";

// Backend adapters
export type {
  AdapterFactory,
  AdapterRegistry,
  BackendCapabilities,
  BackendConfig,
  BackendHealth,
  BackendStats,
  MemoryBackendAdapter,
  QueryExplanation as BackendQueryExplanation,
} from "./adapters/types.js";

export {
  InMemoryAdapter,
  type InMemoryAdapterConfig,
} from "./adapters/InMemoryAdapter.js";

// Service
export type {
  AutoCaptureSettings,
  AutoRecallSettings,
  BackendInfo,
  CacheSettings,
  IntrospectionSettings,
  LoggingSettings,
  MigrationOptions,
  MigrationProgress,
  MigrationResult,
  MigrationSettings,
  UnifiedMemoryConfig,
  UnifiedMemoryService,
} from "./service.js";

export {
  MemoryService,
  UnifiedMemoryService as MemoryServiceClass,
} from "./MemoryService.js";

// Plugin (if using with OpenClaw)
export { createUnifiedMemoryPlugin } from "./plugin.js";

// Version
export const VERSION = "0.1.0";
