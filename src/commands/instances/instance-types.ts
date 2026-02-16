/**
 * Types for multi-instance management
 */

export interface Instance {
  name: string;
  gatewayPort: number;
  bridgePort: number;
  configDir: string;
  createdAt: string;
}

export interface InstanceWithStatus extends Instance {
  status: "running" | "stopped" | "unknown";
}

export interface Registry {
  instances: Record<string, Instance>;
  nextPortOffset: number;
  availableOffsets?: number[]; // Reclaimed offsets from destroyed instances
}

export interface CreateInstanceOptions {
  name: string;
  port?: number;
}

export interface DestroyInstanceOptions {
  name: string;
  force?: boolean;
  keepData?: boolean;
}

export const INSTANCES_BASE_PORT = 18800;
// Port spacing accounts for:
// - Gateway port (base)
// - Bridge port (base + 1)
// - Browser control port (base + 2)
// - Chrome CDP ports (base + 2 + 9 to base + 2 + 108) = 100 ports
// Total needed: 111 ports + buffer = 120
export const INSTANCES_PORT_STEP = 120;
export const INSTANCES_DIR_NAME = ".openclaw-multi";
export const REGISTRY_FILE_NAME = "registry.json";
