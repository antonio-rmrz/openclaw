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
export const INSTANCES_PORT_STEP = 10;
export const INSTANCES_DIR_NAME = ".openclaw-multi";
export const REGISTRY_FILE_NAME = "registry.json";
