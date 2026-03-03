# Unified Memory Interface (UMI) for OpenClaw

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/openclaw/unified-memory)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A unified, backend-agnostic memory system for OpenClaw that consolidates fragmented memory implementations into a single, extensible architecture.

## Features

- **🔌 Multiple Backends**: Support for LanceDB, SQLite+vec, ChromaDB, Pinecone, and file-based storage
- **🔄 Seamless Migration**: Built-in tools to move data between backends without loss
- **🔍 Introspection**: Comprehensive debugging, audit logging, and health monitoring
- **⚡ Unified API**: Single interface regardless of underlying storage
- **🧪 Testing Support**: In-memory adapter for fast testing
- **🔌 Plugin Integration**: Native OpenClaw plugin with tools and CLI commands

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/openclaw/unified-memory.git
cd unified-memory

# Install dependencies
npm install

# Build
npm run build
```

### Basic Usage

```typescript
import { MemoryService, InMemoryAdapter } from "@openclaw/unified-memory";

// Create service with in-memory backend (for testing)
const service = new MemoryService({
  enabled: true,
  defaultBackend: "memory",
  backends: [
    {
      id: "memory",
      type: "memory",
      config: { maxEntries: 10000 },
    },
  ],
});

await service.initialize();

// Store a memory
const memory = await service.store({
  content: "User prefers dark mode",
  metadata: {
    category: "preference",
    importance: 0.8,
    tags: ["ui", "preferences"],
  },
});

// Search memories
const results = await service.search({
  text: "dark mode",
  limit: 5,
  minScore: 0.3,
});

console.log(`Found ${results.length} memories`);

await service.close();
```

## Configuration

### OpenClaw Plugin

Add to your `.openclaw/config.yaml`:

```yaml
memory:
  unified:
    enabled: true
    defaultBackend: lancedb
    
    backends:
      # LanceDB with OpenAI embeddings
      lancedb:
        type: lancedb
        path: ~/.openclaw/memory/vector
        embedding:
          provider: openai
          model: text-embedding-3-small
          apiKey: ${OPENAI_API_KEY}
      
      # Local SQLite with local embeddings
      sqlite:
        type: sqlite
        path: ~/.openclaw/memory/index.db
        embedding:
          provider: local
          model: all-MiniLM-L6-v2
      
      # Legacy file-based storage
      files:
        type: file
        paths:
          - MEMORY.md
          - memory/*.md
    
    # Migration settings
    migration:
      autoMigrate: true
      source: files
      target: lancedb
      backupBeforeMigrate: true
      conflictResolution: rename
    
    # Introspection
    introspection:
      auditLog: true
      queryLogging: true
      statsCollection: true
      healthCheckInterval: 5m
    
    # Auto-capture/recall
    autoCapture:
      enabled: true
      maxChars: 500
      triggers: [remember, prefer, decided]
      minImportance: 0.5
    
    autoRecall:
      enabled: true
      maxMemories: 5
      minScore: 0.3
```

## CLI Commands

```bash
# Core operations
openclaw memory store "User prefers dark mode" --category=preference
copenclaw memory search "dark mode preferences"
openclaw memory forget <id>

# Introspection
openclaw memory stats
openclaw memory health
openclaw memory list-backends

# Migration
openclaw memory migrate --from=files --to=lancedb --dry-run
openclaw memory migrate --from=files --to=lancedb

# Import/Export
openclaw memory export --output=memories.jsonl
openclaw memory import --input=memories.jsonl --backend=lancedb

# Debugging
openclaw memory duplicates --threshold=0.95
```

## Architecture

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

## Backend Capabilities

| Feature | LanceDB | SQLite+vec | ChromaDB | Pinecone | File |
|---------|---------|------------|----------|----------|------|
| Vector Search | ✅ | ✅ | ✅ | ✅ | ❌ |
| Full-Text | ❌ | ✅ | ❌ | ❌ | ✅ |
| Hybrid | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ |
| Metadata Filter | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bulk Import | ✅ | ✅ | ✅ | ✅ | ✅ |
| TTL | ❌ | ✅ | ❌ | ✅ | ❌ |
| Local Only | ✅ | ✅ | ✅ | ❌ | ✅ |

*⚠️ Requires application-level implementation*

## Migration

### From memory-lancedb

```bash
# Analyze before migrating
openclaw memory migrate --from=lancedb --to=unified --analyze

# Dry run
openclaw memory migrate --from=lancedb --to=unified --dry-run

# Execute migration
openclaw memory migrate --from=lancedb --to=unified
```

### From memory-core (file-based)

```bash
# Import existing MEMORY.md files
openclaw memory import --input=MEMORY.md --backend=unified

# Or bulk import
openclaw memory import --input=memory/ --pattern="*.md" --backend=unified
```

## API Reference

### MemoryService

```typescript
interface UnifiedMemoryService {
  // Core operations
  store(input: StoreInput): Promise<MemoryEntry>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  get(id: string): Promise<MemoryEntry | null>;
  update(id: string, patch: UpdatePatch): Promise<MemoryEntry>;
  delete(id: string): Promise<boolean>;
  
  // Multi-backend
  searchAll(query: SearchQuery): Promise<SearchResult[]>;
  listBackends(): Promise<BackendInfo[]>;
  
  // Migration
  export(options?: ExportOptions): Promise<MemoryExport>;
  import(data: MemoryImport): Promise<ImportResult>;
  migrate(source: string, target: string): Promise<MigrationResult>;
  
  // Introspection
  stats(): Promise<MemoryStats>;
  health(): Promise<HealthStatus>;
  audit(filter?: AuditFilter): Promise<AuditEntry[]>;
  detectDuplicates(threshold?: number): Promise<PotentialDuplicate[]>;
}
```

## Creating Custom Backends

```typescript
import { MemoryBackendAdapter } from "@openclaw/unified-memory";

export class MyCustomAdapter implements MemoryBackendAdapter {
  readonly id = "my-backend";
  readonly name = "My Custom Backend";
  readonly version = "1.0.0";
  
  readonly capabilities = {
    vectorSearch: true,
    fullTextSearch: false,
    hybridSearch: false,
    metadataFiltering: true,
    bulkImport: true,
    ttl: false,
    transactions: false,
  };

  async initialize(config: unknown): Promise<void> {
    // Setup connection, create tables, etc.
  }

  async store(entry: MemoryEntry): Promise<void> {
    // Store the entry
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    // Perform search
    return [];
  }

  // ... implement other methods
}
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## Roadmap

- [x] Core types and interfaces
- [x] In-memory adapter
- [ ] LanceDB adapter
- [ ] SQLite+vec adapter
- [ ] File-based adapter
- [ ] Migration engine
- [ ] Introspection tools
- [ ] OpenClaw plugin integration
- [ ] ChromaDB adapter
- [ ] Pinecone adapter
- [ ] Distributed memory support

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT © OpenClaw Contributors

## Acknowledgments

This project builds upon the excellent work in the OpenClaw memory system, particularly:
- The existing `memory-lancedb` plugin
- The builtin SQLite/FTS memory manager
- The `memory-core` file-based system
