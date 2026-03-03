# Unified Memory Interface (UMI) for OpenClaw

## Executive Summary

This document proposes a **Unified Memory Interface (UMI)** for OpenClaw that consolidates the current fragmented memory implementations (`memory-core`, `memory-lancedb`, builtin SQLite/FTS manager) into a single, extensible architecture supporting multiple backends, seamless migration, and comprehensive introspection tools.

## Current State Analysis

### Existing Memory Systems

| Component | Backend | Features | Limitations |
|-----------|---------|----------|-------------|
| `memory-core` | File-based (MEMORY.md) | Search, CLI | No vector search, limited scale |
| `memory-lancedb` | LanceDB + OpenAI | Vector search, auto-capture/recall | Requires OpenAI, no migration path |
| Builtin Manager | SQLite + sqlite-vec | Hybrid (vector + FTS), multi-provider | Complex configuration |
| QMD Manager | External process | Advanced reranking | Requires separate service |

### Pain Points

1. **Fragmentation**: Multiple memory implementations don't share data
2. **No Migration Path**: Users can't easily move between backends
3. **Limited Introspection**: No unified way to debug, inspect, or audit memories
4. **Configuration Complexity**: Each backend has different config schemas
5. **Vendor Lock-in**: Hard dependency on specific providers (e.g., OpenAI for LanceDB)

## Proposed Architecture

### Core Principles

1. **Backend Agnostic**: Support vector DBs, file-based, SQLite, cloud providers
2. **Unified API**: Single interface regardless of backend
3. **Seamless Migration**: Built-in tools to move data between backends
4. **Observable**: Built-in introspection, debugging, and audit capabilities
5. **Extensible**: Plugin-based backend system

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Unified Memory Interface                      │
│                           (MemoryService)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Search    │  │    Store    │  │   Migrate   │  │  Introspect│  │
│  │   API       │  │    API      │  │   Engine    │  │   Tools    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │
└─────────┼────────────────┼────────────────┼───────────────┼────────┘
          │                │                │               │
          ▼                ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend Adapter Layer                         │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────┤
│  LanceDB    │  SQLite+Vec │  ChromaDB   │  Pinecone   │  File-based │
│  Adapter    │  Adapter    │  Adapter    │  Adapter    │  Adapter    │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

## Design Specification

### 1. Core Types

```typescript
// Memory entry - universal format
interface MemoryEntry {
  id: string;                    // UUID v4
  content: string;               // Text content
  embedding?: number[];          // Optional vector embedding
  metadata: MemoryMetadata;
  timestamps: Timestamps;
  source: MemorySource;
}

interface MemoryMetadata {
  category: MemoryCategory;      // preference | fact | decision | entity | other
  importance: number;            // 0.0 - 1.0
  tags: string[];                // User-defined tags
  agentId: string;               // Originating agent
  sessionKey?: string;           // Optional session context
  custom: Record<string, unknown>; // Backend-specific extensions
}

interface Timestamps {
  created: number;               // Unix ms
  updated: number;               // Unix ms
  accessed?: number;             // Last read
  expires?: number;              // Optional TTL
}

interface MemorySource {
  type: 'auto' | 'manual' | 'imported' | 'migrated';
  tool?: string;                 // Originating tool (memory_store, auto-capture, etc.)
  originalId?: string;           // ID from source system (for migration)
}

type MemoryCategory = 'preference' | 'fact' | 'decision' | 'entity' | 'other';
```

### 2. Unified API Interface

```typescript
interface UnifiedMemoryService {
  // Core operations
  store(entry: StoreInput): Promise<MemoryEntry>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  get(id: string): Promise<MemoryEntry | null>;
  update(id: string, patch: UpdatePatch): Promise<MemoryEntry>;
  delete(id: string): Promise<boolean>;
  
  // Batch operations
  storeBatch(entries: StoreInput[]): Promise<MemoryEntry[]>;
  deleteBatch(ids: string[]): Promise<number>;
  
  // Migration
  export(options: ExportOptions): Promise<MemoryExport>;
  import(data: MemoryImport): Promise<ImportResult>;
  migrate(target: BackendConfig): Promise<MigrationResult>;
  
  // Introspection
  stats(): Promise<MemoryStats>;
  health(): Promise<HealthStatus>;
  audit(filter: AuditFilter): Promise<AuditEntry[]>;
  queryBuilder(): QueryBuilder;
  
  // Lifecycle
  close(): Promise<void>;
}

interface SearchQuery {
  text?: string;                 // Semantic search
  vector?: number[];             // Direct vector query
  filter?: FilterExpression;     // Metadata filtering
  limit?: number;
  minScore?: number;
  includeVectors?: boolean;
}

interface SearchResult {
  entry: MemoryEntry;
  score: number;                 // Similarity score 0-1
  highlights?: string[];         // Matched segments
}
```

### 3. Backend Adapter Interface

```typescript
interface MemoryBackendAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: BackendCapabilities;
  
  // Core
  initialize(config: unknown): Promise<void>;
  store(entry: MemoryEntry): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  get(id: string): Promise<MemoryEntry | null>;
  update(id: string, patch: UpdatePatch): Promise<void>;
  delete(id: string): Promise<boolean>;
  
  // Migration support
  exportAll(): AsyncIterable<MemoryEntry>;
  importBatch(entries: MemoryEntry[]): Promise<number>;
  
  // Introspection
  stats(): Promise<BackendStats>;
  health(): Promise<HealthStatus>;
  
  // Cleanup
  close(): Promise<void>;
}

interface BackendCapabilities {
  vectorSearch: boolean;
  fullTextSearch: boolean;
  hybridSearch: boolean;
  metadataFiltering: boolean;
  bulkImport: boolean;
  ttl: boolean;
  transactions: boolean;
  maxDimensions?: number;
}
```

### 4. Migration System

```typescript
interface MigrationEngine {
  // Analyze source
  analyze(source: BackendConfig): Promise<MigrationAnalysis>;
  
  // Plan migration
  plan(source: BackendConfig, target: BackendConfig): Promise<MigrationPlan>;
  
  // Execute with progress
  execute(plan: MigrationPlan, onProgress: ProgressCallback): Promise<MigrationResult>;
  
  // Validate result
  validate(result: MigrationResult): Promise<ValidationReport>;
}

interface MigrationPlan {
  source: BackendInfo;
  target: BackendInfo;
  estimatedSize: number;
  conflicts: Conflict[];
  transformations: Transform[];
  dryRun?: boolean;
}
```

### 5. Introspection & Debugging Tools

```typescript
interface IntrospectionTools {
  // Statistics and health
  getStats(): Promise<MemoryStats>;
  getHealth(): Promise<HealthStatus>;
  
  // Query debugging
  explainQuery(query: SearchQuery): Promise<QueryExplanation>;
  
  // Memory audit trail
  getAuditLog(filter: AuditFilter): Promise<AuditEntry[]>;
  
  // Vector analysis
  findSimilarVectors(id: string, threshold: number): Promise<SimilarityCluster[]>;
  detectDuplicates(threshold: number): Promise<PotentialDuplicate[]>;
  
  // Export for external analysis
  exportSample(sampleSize: number): Promise<MemoryExport>;
}

interface MemoryStats {
  totalEntries: number;
  byCategory: Record<MemoryCategory, number>;
  bySource: Record<string, number>;
  averageImportance: number;
  storageUsed: number;
  indexSize: number;
  lastSync: number;
  backendSpecific: Record<string, unknown>;
}
```

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Core types and interfaces
- [ ] Base adapter class
- [ ] In-memory adapter (for testing)
- [ ] Service container

### Phase 2: Backend Adapters (Weeks 3-4)
- [ ] LanceDB adapter (migrate from existing)
- [ ] SQLite+vec adapter (migrate from existing)
- [ ] File-based adapter (for MEMORY.md compatibility)
- [ ] Adapter factory and registry

### Phase 3: Migration Engine (Weeks 5-6)
- [ ] Migration analyzer
- [ ] Schema transformer
- [ ] Progress tracking
- [ ] Conflict resolution UI

### Phase 4: Introspection Tools (Weeks 7-8)
- [ ] Stats and health endpoints
- [ ] Query debugger
- [ ] Audit logging
- [ ] Duplicate detection

### Phase 5: Integration (Weeks 9-10)
- [ ] Plugin SDK integration
- [ ] CLI commands
- [ ] Configuration schema
- [ ] Documentation

## Configuration Schema

```yaml
# .openclaw/config.yaml
memory:
  # Unified interface configuration
  unified:
    enabled: true
    defaultBackend: lancedb
    
    # Backend definitions
    backends:
      lancedb:
        type: lancedb
        path: ~/.openclaw/memory/vector
        embedding:
          provider: openai
          model: text-embedding-3-small
          apiKey: ${OPENAI_API_KEY}
      
      sqlite:
        type: sqlite
        path: ~/.openclaw/memory/index.db
        embedding:
          provider: local
          model: all-MiniLM-L6-v2
      
      legacy:
        type: file
        paths:
          - MEMORY.md
          - memory/*.md
    
    # Migration settings
    migration:
      autoMigrate: true
      source: legacy
      target: lancedb
      backupBeforeMigrate: true
    
    # Introspection
    introspection:
      auditLog: true
      queryLogging: true
      statsCollection: true
      healthCheckInterval: 5m
    
    # Auto-capture/recall (unified)
    autoCapture:
      enabled: true
      maxChars: 500
      triggers:
        - remember
        - prefer
        - decided
    
    autoRecall:
      enabled: true
      maxMemories: 5
      minScore: 0.3
```

## Migration Path for Existing Users

### From memory-lancedb

```bash
# Auto-detect and migrate
openclaw memory migrate --from=lancedb --to=unified

# Or manual migration with verification
openclaw memory export --backend=lancedb --output=memories.jsonl
openclaw memory import --backend=unified --input=memories.jsonl --verify
```

### From memory-core (file-based)

```bash
# Import existing MEMORY.md files
openclaw memory import-files --pattern "memory/*.md" --backend=unified

# Or convert in-place with backup
openclaw memory migrate-files --in-place --backup
```

## CLI Commands

```bash
# Core operations
openclaw memory store "User prefers dark mode" --category=preference
openclaw memory search "dark mode preferences"
openclaw memory get <id>
openclaw memory delete <id>

# Migration
openclaw memory migrate --analyze
openclaw memory migrate --execute --dry-run
openclaw memory migrate --execute

# Introspection
openclaw memory stats
openclaw memory health
openclaw memory audit --since=7d
openclaw memory duplicates --threshold=0.95
openclaw memory export --format=jsonl

# Backend management
openclaw memory backends list
openclaw memory backends switch <name>
openclaw memory backends status
```

## Open Questions

1. **Embedding Provider Strategy**: Should each backend manage its own embeddings, or should UMI provide a centralized embedding service?

2. **Conflict Resolution**: How should conflicts be handled during migration (e.g., duplicate memories)?

3. **Real-time Sync**: Should multiple backends be kept in sync in real-time for redundancy?

4. **Access Control**: Should memories have access control (agent-specific, shared, public)?

5. **Versioning**: Should memory updates create new versions or overwrite?

## Success Metrics

- [ ] Migration from any existing backend completes without data loss
- [ ] Query performance within 10% of native backend
- [ ] Zero configuration for basic usage
- [ ] All existing memory tools work through UMI
- [ ] < 100ms p99 for search queries under 1M entries

## Appendix: Backend Capability Matrix

| Feature | LanceDB | SQLite+vec | ChromaDB | Pinecone | File |
|---------|---------|------------|----------|----------|------|
| Vector Search | ✅ | ✅ | ✅ | ✅ | ❌ |
| Full-Text | ❌ | ✅ | ❌ | ❌ | ✅ |
| Hybrid | ⚠️* | ✅ | ⚠️* | ⚠️* | ❌ |
| Metadata Filter | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bulk Import | ✅ | ✅ | ✅ | ✅ | ✅ |
| TTL | ❌ | ✅ | ❌ | ✅ | ❌ |
| Local Only | ✅ | ✅ | ✅ | ❌ | ✅ |

*Requires application-level implementation
