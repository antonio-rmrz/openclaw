/**
 * Core logic for managing multiple OpenClaw Docker instances
 */

import { execSync, spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { createServer } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type {
  Instance,
  InstanceWithStatus,
  Registry,
  CreateInstanceOptions,
  DestroyInstanceOptions,
} from "./instance-types.js";
import {
  INSTANCES_BASE_PORT,
  INSTANCES_PORT_STEP,
  INSTANCES_DIR_NAME,
  REGISTRY_FILE_NAME,
} from "./instance-types.js";

export class InstanceManager {
  private readonly baseDir: string;
  private readonly registryPath: string;
  private readonly repoDir: string;

  constructor(options?: { baseDir?: string; repoDir?: string }) {
    this.baseDir = options?.baseDir ?? path.join(os.homedir(), INSTANCES_DIR_NAME);
    this.registryPath = path.join(this.baseDir, REGISTRY_FILE_NAME);
    // Detect repo directory (for Dockerfile)
    this.repoDir = options?.repoDir ?? this.findRepoDir();
  }

  private findRepoDir(): string {
    // Try to find the openclaw repo directory
    // Check if we're running from within the repo
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      if (
        fs.existsSync(path.join(dir, "Dockerfile")) &&
        fs.existsSync(path.join(dir, "package.json"))
      ) {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
        if (pkg.name === "openclaw") {
          return dir;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    // Fallback to cwd
    return process.cwd();
  }

  // === Registry Management ===

  private initRegistry(): void {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(path.join(this.baseDir, "instances"), { recursive: true });
    if (!fs.existsSync(this.registryPath)) {
      const emptyRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      fs.writeFileSync(this.registryPath, JSON.stringify(emptyRegistry, null, 2));
    }
  }

  private readRegistry(): Registry {
    this.initRegistry();
    const content = fs.readFileSync(this.registryPath, "utf-8");
    return JSON.parse(content) as Registry;
  }

  private writeRegistry(registry: Registry): void {
    fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
  }

  // === Port Allocation ===

  /**
   * Check if a port is available for binding
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();

      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          // Other errors (e.g., permission) also mean port is not available
          resolve(false);
        }
      });

      server.once("listening", () => {
        server.close();
        resolve(true);
      });

      server.listen(port, "127.0.0.1");
    });
  }

  /**
   * Allocate ports for a new instance
   * Reuses offsets from destroyed instances when possible
   * Checks port availability before allocation
   */
  private async allocatePort(): Promise<{ gatewayPort: number; bridgePort: number }> {
    const registry = this.readRegistry();
    const maxAttempts = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let offset: number;

      // Try to reuse an available offset from destroyed instances first
      if (registry.availableOffsets && registry.availableOffsets.length > 0) {
        offset = registry.availableOffsets.shift()!;
      } else {
        offset = registry.nextPortOffset;
        registry.nextPortOffset++;
      }

      const gatewayPort = INSTANCES_BASE_PORT + offset * INSTANCES_PORT_STEP;
      const bridgePort = gatewayPort + 1;

      // Validate port range
      if (gatewayPort > 65535 || bridgePort > 65535) {
        throw new Error(
          `Port allocation exceeded valid range (gateway: ${gatewayPort}, bridge: ${bridgePort})`,
        );
      }

      // Check if ports are available
      const gatewayAvailable = await this.isPortAvailable(gatewayPort);
      const bridgeAvailable = await this.isPortAvailable(bridgePort);

      if (gatewayAvailable && bridgeAvailable) {
        this.writeRegistry(registry);
        return { gatewayPort, bridgePort };
      }

      // Ports not available, add offset back for future reuse and try next
      if (!registry.availableOffsets) {
        registry.availableOffsets = [];
      }
      registry.availableOffsets.push(offset);
      registry.availableOffsets.sort((a, b) => a - b);
    }

    throw new Error(
      `Could not find available ports after ${maxAttempts} attempts. Please specify a custom port with --port`,
    );
  }

  // === Instance Directory ===

  private getInstanceDir(name: string): string {
    return path.join(this.baseDir, "instances", name);
  }

  // === Token Generation ===

  private generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  // === Docker Compose Generation ===

  private generateDockerCompose(instance: Instance): string {
    return `# OpenClaw Instance: ${instance.name}
# Auto-generated - do not edit directly

services:
  gateway:
    image: \${OPENCLAW_IMAGE:-openclaw:local}
    container_name: openclaw-\${INSTANCE_NAME}-gateway
    environment:
      HOME: /home/node
      TERM: xterm-256color
      OPENCLAW_GATEWAY_TOKEN: \${OPENCLAW_GATEWAY_TOKEN}
      CLAUDE_AI_SESSION_KEY: \${CLAUDE_AI_SESSION_KEY:-}
      CLAUDE_WEB_SESSION_KEY: \${CLAUDE_WEB_SESSION_KEY:-}
      CLAUDE_WEB_COOKIE: \${CLAUDE_WEB_COOKIE:-}
    volumes:
      - ./config:/home/node/.openclaw
      - ./workspace:/home/node/.openclaw/workspace
    ports:
      - "\${GATEWAY_PORT}:18789"
      - "\${BRIDGE_PORT}:18790"
    init: true
    restart: unless-stopped
    command:
      [
        "node",
        "dist/index.js",
        "gateway",
        "--bind",
        "\${OPENCLAW_GATEWAY_BIND:-loopback}",
        "--port",
        "18789",
      ]

  cli:
    image: \${OPENCLAW_IMAGE:-openclaw:local}
    container_name: openclaw-\${INSTANCE_NAME}-cli
    profiles:
      - cli
    environment:
      HOME: /home/node
      TERM: xterm-256color
      OPENCLAW_GATEWAY_TOKEN: \${OPENCLAW_GATEWAY_TOKEN}
      BROWSER: echo
    volumes:
      - ./config:/home/node/.openclaw
      - ./workspace:/home/node/.openclaw/workspace
    stdin_open: true
    tty: true
    init: true
    entrypoint: ["node", "dist/index.js"]
`;
  }

  private generateEnvFile(instance: Instance, token: string): string {
    return `# OpenClaw Instance: ${instance.name}
# Created: ${instance.createdAt}

INSTANCE_NAME=${instance.name}
GATEWAY_PORT=${instance.gatewayPort}
BRIDGE_PORT=${instance.bridgePort}
OPENCLAW_IMAGE=openclaw:local
OPENCLAW_GATEWAY_TOKEN=${token}
# Security: Default to loopback (localhost only)
# Change to 'lan' to expose to local network
OPENCLAW_GATEWAY_BIND=loopback

# Add your API keys below:
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# OPENROUTER_API_KEY=

# Channel tokens (optional):
# TELEGRAM_BOT_TOKEN=
# DISCORD_BOT_TOKEN=
`;
  }

  // === Docker Status ===

  private isContainerRunning(containerName: string): boolean {
    try {
      execSync(`docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${containerName}$"`, {
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }

  private isDockerAvailable(): boolean {
    try {
      execSync("docker --version", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  private isImageAvailable(imageName: string = "openclaw:local"): boolean {
    try {
      execSync(`docker image inspect ${imageName} >/dev/null 2>&1`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  // === Public API ===

  /**
   * Check if Docker is available
   */
  checkDocker(): { available: boolean; error?: string } {
    if (!this.isDockerAvailable()) {
      return { available: false, error: "Docker is not installed or not running" };
    }
    return { available: true };
  }

  /**
   * Build the OpenClaw Docker image
   */
  async buildImage(onOutput?: (data: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("docker", ["build", "-t", "openclaw:local", "-f", "Dockerfile", "."], {
        cwd: this.repoDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout?.on("data", (data) => onOutput?.(data.toString()));
      proc.stderr?.on("data", (data) => onOutput?.(data.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Docker build failed with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }

  /**
   * List all instances with their current status
   */
  listInstances(): InstanceWithStatus[] {
    const registry = this.readRegistry();
    const instances: InstanceWithStatus[] = [];

    for (const [name, instance] of Object.entries(registry.instances)) {
      const containerName = `openclaw-${name}-gateway`;
      let status: InstanceWithStatus["status"] = "unknown";

      try {
        if (this.isContainerRunning(containerName)) {
          status = "running";
        } else {
          status = "stopped";
        }
      } catch {
        status = "unknown";
      }

      instances.push({ ...instance, status });
    }

    return instances.toSorted((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a single instance by name
   */
  getInstance(name: string): InstanceWithStatus | null {
    const registry = this.readRegistry();
    const instance = registry.instances[name];
    if (!instance) {
      return null;
    }

    const containerName = `openclaw-${name}-gateway`;
    let status: InstanceWithStatus["status"] = "unknown";

    try {
      if (this.isContainerRunning(containerName)) {
        status = "running";
      } else {
        status = "stopped";
      }
    } catch {
      status = "unknown";
    }

    return { ...instance, status };
  }

  /**
   * Check if an instance exists
   */
  instanceExists(name: string): boolean {
    const registry = this.readRegistry();
    return name in registry.instances;
  }

  /**
   * Validate instance name
   */
  validateName(name: string): { valid: boolean; error?: string } {
    if (!name) {
      return { valid: false, error: "Name is required" };
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      return {
        valid: false,
        error:
          "Name must start with a letter and contain only letters, numbers, dashes, underscores",
      };
    }
    if (name.length > 32) {
      return { valid: false, error: "Name must be 32 characters or less" };
    }
    if (this.instanceExists(name)) {
      return { valid: false, error: `Instance '${name}' already exists` };
    }
    return { valid: true };
  }

  /**
   * Create a new instance
   */
  async create(options: CreateInstanceOptions): Promise<Instance> {
    const { name, port } = options;

    // Validate
    const validation = this.validateName(name);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Allocate ports
    let gatewayPort: number;
    let bridgePort: number;
    if (port) {
      // Validate custom port
      if (port < 1024 || port > 65534) {
        throw new Error("Port must be between 1024 and 65534");
      }
      // Check custom port availability
      if (!(await this.isPortAvailable(port)) || !(await this.isPortAvailable(port + 1))) {
        throw new Error(`Port ${port} or ${port + 1} is already in use`);
      }
      gatewayPort = port;
      bridgePort = port + 1;
    } else {
      const ports = await this.allocatePort();
      gatewayPort = ports.gatewayPort;
      bridgePort = ports.bridgePort;
    }

    // Create instance data
    const instanceDir = this.getInstanceDir(name);
    const instance: Instance = {
      name,
      gatewayPort,
      bridgePort,
      configDir: instanceDir,
      createdAt: new Date().toISOString(),
    };

    // Create directories
    fs.mkdirSync(path.join(instanceDir, "config"), { recursive: true });
    fs.mkdirSync(path.join(instanceDir, "workspace"), { recursive: true });

    // Generate files
    const token = this.generateToken();
    fs.writeFileSync(
      path.join(instanceDir, "docker-compose.yml"),
      this.generateDockerCompose(instance),
    );

    // Write .env file with restricted permissions (owner only)
    const envPath = path.join(instanceDir, ".env");
    fs.writeFileSync(envPath, this.generateEnvFile(instance, token));
    // Set file permissions to 600 (rw-------)
    // This prevents other users on the system from reading API keys
    fs.chmodSync(envPath, 0o600);

    // Register instance
    const registry = this.readRegistry();
    registry.instances[name] = instance;
    this.writeRegistry(registry);

    return instance;
  }

  /**
   * Start an instance
   */
  async start(name: string): Promise<void> {
    const instance = this.getInstance(name);
    if (!instance) {
      throw new Error(`Instance '${name}' not found`);
    }

    // Check if image exists, build if not
    if (!this.isImageAvailable()) {
      throw new Error(
        "Docker image 'openclaw:local' not found. Run 'openclaw instances build' first.",
      );
    }

    const instanceDir = this.getInstanceDir(name);
    execSync("docker compose up -d gateway", {
      cwd: instanceDir,
      stdio: "inherit",
      env: { ...process.env, COMPOSE_PROJECT_NAME: `ocm-${name}` },
    });
  }

  /**
   * Stop an instance
   */
  async stop(name: string): Promise<void> {
    const instance = this.getInstance(name);
    if (!instance) {
      throw new Error(`Instance '${name}' not found`);
    }

    const instanceDir = this.getInstanceDir(name);
    execSync("docker compose stop", {
      cwd: instanceDir,
      stdio: "inherit",
      env: { ...process.env, COMPOSE_PROJECT_NAME: `ocm-${name}` },
    });
  }

  /**
   * Destroy an instance
   */
  async destroy(options: DestroyInstanceOptions): Promise<void> {
    const { name, keepData } = options;

    const instance = this.getInstance(name);
    if (!instance) {
      throw new Error(`Instance '${name}' not found`);
    }

    // Calculate port offset for reclamation
    const portOffset = Math.floor(
      (instance.gatewayPort - INSTANCES_BASE_PORT) / INSTANCES_PORT_STEP,
    );

    // Stop and remove containers
    const instanceDir = this.getInstanceDir(name);
    try {
      execSync("docker compose down -v --remove-orphans", {
        cwd: instanceDir,
        stdio: "pipe",
        env: { ...process.env, COMPOSE_PROJECT_NAME: `ocm-${name}` },
      });
    } catch {
      // Ignore errors if containers don't exist
    }

    // Remove data unless keepData is true
    if (!keepData && fs.existsSync(instanceDir)) {
      fs.rmSync(instanceDir, { recursive: true, force: true });
    }

    // Unregister instance and reclaim port offset
    const registry = this.readRegistry();
    delete registry.instances[name];

    // Add offset to available pool for reuse
    if (!registry.availableOffsets) {
      registry.availableOffsets = [];
    }
    registry.availableOffsets.push(portOffset);
    registry.availableOffsets.sort((a, b) => a - b); // Keep sorted for efficient reuse

    this.writeRegistry(registry);
  }

  /**
   * Get logs for an instance
   */
  streamLogs(name: string, follow: boolean = true): ReturnType<typeof spawn> {
    const instance = this.getInstance(name);
    if (!instance) {
      throw new Error(`Instance '${name}' not found`);
    }

    const instanceDir = this.getInstanceDir(name);
    const args = ["compose", "logs"];
    if (follow) {
      args.push("-f");
    }
    args.push("gateway");

    return spawn("docker", args, {
      cwd: instanceDir,
      stdio: "inherit",
      env: { ...process.env, COMPOSE_PROJECT_NAME: `ocm-${name}` },
    });
  }

  /**
   * Run a CLI command in an instance
   */
  runCli(name: string, args: string[]): ReturnType<typeof spawn> {
    const instance = this.getInstance(name);
    if (!instance) {
      throw new Error(`Instance '${name}' not found`);
    }

    const instanceDir = this.getInstanceDir(name);
    return spawn("docker", ["compose", "run", "--rm", "cli", ...args], {
      cwd: instanceDir,
      stdio: "inherit",
      env: { ...process.env, COMPOSE_PROJECT_NAME: `ocm-${name}` },
    });
  }

  /**
   * Open config file for editing
   */
  getConfigPath(name: string): string {
    const instance = this.getInstance(name);
    if (!instance) {
      throw new Error(`Instance '${name}' not found`);
    }
    return path.join(this.getInstanceDir(name), ".env");
  }

  /**
   * Get dashboard URL
   */
  getDashboardUrl(name: string): string {
    const instance = this.getInstance(name);
    if (!instance) {
      throw new Error(`Instance '${name}' not found`);
    }
    return `http://127.0.0.1:${instance.gatewayPort}/`;
  }
}

// Singleton instance
let _manager: InstanceManager | undefined;
export function getInstanceManager(): InstanceManager {
  if (!_manager) {
    _manager = new InstanceManager();
  }
  return _manager;
}
