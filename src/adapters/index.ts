/**
 * Backend Adapters for Unified Memory Interface
 */

export {
  InMemoryAdapter,
  type InMemoryAdapterConfig,
} from "./InMemoryAdapter.js";

export type {
  AdapterFactory,
  AdapterRegistry,
  BackendCapabilities,
  BackendConfig,
  BackendInfo,
  BackendStats,
  MemoryBackendAdapter,
  QueryExplanation,
  QueryStep,
} from "./types.js";
