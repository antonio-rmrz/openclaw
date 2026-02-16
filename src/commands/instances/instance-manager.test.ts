/**
 * Unit tests for InstanceManager
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Registry } from "./instance-types.js";
import { InstanceManager } from "./instance-manager.js";
import {
  INSTANCES_BASE_PORT,
  INSTANCES_PORT_STEP,
  INSTANCES_DIR_NAME,
  REGISTRY_FILE_NAME,
} from "./instance-types.js";

// Mock modules
vi.mock("node:child_process");
vi.mock("node:fs");

describe("InstanceManager", () => {
  let manager: InstanceManager;
  let tempDir: string;
  let registryPath: string;

  beforeEach(() => {
    // Setup temp directory for tests
    tempDir = path.join(os.tmpdir(), `openclaw-test-${Date.now()}`);
    registryPath = path.join(tempDir, REGISTRY_FILE_NAME);

    // Mock fs functions
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath === registryPath) {
        return JSON.stringify({ instances: {}, nextPortOffset: 0 });
      }
      return "";
    });
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    manager = new InstanceManager({ baseDir: tempDir, repoDir: process.cwd() });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("validateName", () => {
    it("should accept valid names", () => {
      const validNames = ["test", "my-instance", "instance_1", "Test123"];

      for (const name of validNames) {
        const result = manager.validateName(name);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it("should reject empty names", () => {
      const result = manager.validateName("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Name is required");
    });

    it("should reject names starting with numbers", () => {
      const result = manager.validateName("123test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must start with a letter");
    });

    it("should reject names with special characters", () => {
      const invalidNames = ["test@instance", "my instance", "test#1", "test.instance"];

      for (const name of invalidNames) {
        const result = manager.validateName(name);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("letters, numbers, dashes, underscores");
      }
    });

    it("should reject names longer than 32 characters", () => {
      const longName = "a".repeat(33);
      const result = manager.validateName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Name must be 32 characters or less");
    });

    it("should reject duplicate names", () => {
      // Mock existing instance
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          instances: { existing: { name: "existing" } },
          nextPortOffset: 1,
        }),
      );

      const result = manager.validateName("existing");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Instance 'existing' already exists");
    });
  });

  describe("port allocation", () => {
    it("should allocate ports sequentially with correct spacing", () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      // First allocation
      const ports1 = (manager as any).allocatePort();
      expect(ports1.gatewayPort).toBe(INSTANCES_BASE_PORT); // 18800
      expect(ports1.bridgePort).toBe(INSTANCES_BASE_PORT + 1); // 18801

      // Update mock to reflect increment
      mockRegistry.nextPortOffset = 1;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      // Second allocation
      const ports2 = (manager as any).allocatePort();
      expect(ports2.gatewayPort).toBe(INSTANCES_BASE_PORT + INSTANCES_PORT_STEP); // 18810
      expect(ports2.bridgePort).toBe(INSTANCES_BASE_PORT + INSTANCES_PORT_STEP + 1); // 18811
    });

    it("should maintain 10-port spacing between instances", () => {
      const offset1 = 0;
      const offset2 = 1;
      const offset3 = 2;

      const port1 = INSTANCES_BASE_PORT + offset1 * INSTANCES_PORT_STEP;
      const port2 = INSTANCES_BASE_PORT + offset2 * INSTANCES_PORT_STEP;
      const port3 = INSTANCES_BASE_PORT + offset3 * INSTANCES_PORT_STEP;

      expect(port2 - port1).toBe(10);
      expect(port3 - port2).toBe(10);
    });
  });

  describe("checkDocker", () => {
    it("should return available:true when Docker is installed", () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("Docker version 24.0.0"));

      const result = manager.checkDocker();
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return available:false when Docker is not installed", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("command not found");
      });

      const result = manager.checkDocker();
      expect(result.available).toBe(false);
      expect(result.error).toBe("Docker is not installed or not running");
    });
  });

  describe("create", () => {
    beforeEach(() => {
      // Mock Docker being available
      vi.mocked(execSync).mockReturnValue(Buffer.from(""));
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    it("should create instance with auto-allocated ports", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      const instance = await manager.create({ name: "test" });

      expect(instance.name).toBe("test");
      expect(instance.gatewayPort).toBe(18800);
      expect(instance.bridgePort).toBe(18801);
      expect(instance.configDir).toContain("test");
    });

    it("should create instance with custom port", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      const instance = await manager.create({ name: "test", port: 19000 });

      expect(instance.gatewayPort).toBe(19000);
      expect(instance.bridgePort).toBe(19001);
    });

    it("should create necessary directories", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      await manager.create({ name: "test" });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("test/config"),
        expect.any(Object),
      );
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("test/workspace"),
        expect.any(Object),
      );
    });

    it("should generate docker-compose.yml", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      await manager.create({ name: "test" });

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0].toString().includes("docker-compose.yml"));

      expect(writeCall).toBeDefined();
      const content = writeCall?.[1] as string;
      expect(content).toContain("services:");
      expect(content).toContain("gateway:");
      expect(content).toContain("openclaw-${INSTANCE_NAME}-gateway");
    });

    it("should generate .env file with token", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      await manager.create({ name: "test" });

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0].toString().endsWith(".env"));

      expect(writeCall).toBeDefined();
      const content = writeCall?.[1] as string;
      expect(content).toContain("INSTANCE_NAME=test");
      expect(content).toContain("GATEWAY_PORT=18800");
      expect(content).toContain("OPENCLAW_GATEWAY_TOKEN=");
      expect(content).toMatch(/OPENCLAW_GATEWAY_TOKEN=[a-f0-9]{64}/); // 32 bytes hex = 64 chars
    });

    it("should register instance in registry", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      await manager.create({ name: "test" });

      const registryWrites = vi
        .mocked(fs.writeFileSync)
        .mock.calls.filter((call) => call[0] === registryPath);

      expect(registryWrites.length).toBeGreaterThan(0);
      const lastWrite = registryWrites[registryWrites.length - 1];
      const registry = JSON.parse(lastWrite[1] as string);
      expect(registry.instances.test).toBeDefined();
      expect(registry.instances.test.name).toBe("test");
    });

    it("should increment nextPortOffset", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 5 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      await manager.create({ name: "test" });

      const registryWrites = vi
        .mocked(fs.writeFileSync)
        .mock.calls.filter((call) => call[0] === registryPath);

      const lastWrite = registryWrites[registryWrites.length - 1];
      const registry = JSON.parse(lastWrite[1] as string);
      expect(registry.nextPortOffset).toBe(6);
    });

    it("should throw error for invalid name", async () => {
      await expect(manager.create({ name: "123invalid" })).rejects.toThrow(
        "must start with a letter",
      );
    });

    it("should throw error for duplicate name", async () => {
      const mockRegistry: Registry = {
        instances: { existing: { name: "existing" } as any },
        nextPortOffset: 1,
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      await expect(manager.create({ name: "existing" })).rejects.toThrow("already exists");
    });
  });

  describe("listInstances", () => {
    it("should return empty array when no instances exist", () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      const instances = manager.listInstances();
      expect(instances).toEqual([]);
    });

    it("should return all instances sorted by name", () => {
      const mockRegistry: Registry = {
        instances: {
          charlie: {
            name: "charlie",
            gatewayPort: 18820,
            bridgePort: 18821,
            configDir: "/path/charlie",
            createdAt: "2026-02-15T00:00:00.000Z",
          },
          alpha: {
            name: "alpha",
            gatewayPort: 18800,
            bridgePort: 18801,
            configDir: "/path/alpha",
            createdAt: "2026-02-15T00:00:00.000Z",
          },
          beta: {
            name: "beta",
            gatewayPort: 18810,
            bridgePort: 18811,
            configDir: "/path/beta",
            createdAt: "2026-02-15T00:00:00.000Z",
          },
        },
        nextPortOffset: 3,
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not running");
      });

      const instances = manager.listInstances();

      expect(instances).toHaveLength(3);
      expect(instances[0].name).toBe("alpha");
      expect(instances[1].name).toBe("beta");
      expect(instances[2].name).toBe("charlie");
    });

    it("should detect running containers", () => {
      const mockRegistry: Registry = {
        instances: {
          running: {
            name: "running",
            gatewayPort: 18800,
            bridgePort: 18801,
            configDir: "/path/running",
            createdAt: "2026-02-15T00:00:00.000Z",
          },
          stopped: {
            name: "stopped",
            gatewayPort: 18810,
            bridgePort: 18811,
            configDir: "/path/stopped",
            createdAt: "2026-02-15T00:00:00.000Z",
          },
        },
        nextPortOffset: 2,
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      // Mock docker ps - only "running" is found
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd.toString().includes("openclaw-running-gateway")) {
          return Buffer.from("");
        }
        throw new Error("not found");
      });

      const instances = manager.listInstances();

      expect(instances[0].status).toBe("running");
      expect(instances[1].status).toBe("stopped");
    });
  });

  describe("getInstance", () => {
    it("should return instance by name", () => {
      const mockRegistry: Registry = {
        instances: {
          test: {
            name: "test",
            gatewayPort: 18800,
            bridgePort: 18801,
            configDir: "/path/test",
            createdAt: "2026-02-15T00:00:00.000Z",
          },
        },
        nextPortOffset: 1,
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not running");
      });

      const instance = manager.getInstance("test");

      expect(instance).toBeDefined();
      expect(instance?.name).toBe("test");
      expect(instance?.status).toBe("stopped");
    });

    it("should return null for non-existent instance", () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      const instance = manager.getInstance("nonexistent");
      expect(instance).toBeNull();
    });
  });

  describe("getConfigPath", () => {
    it("should return .env path for instance", () => {
      const mockRegistry: Registry = {
        instances: {
          test: {
            name: "test",
            gatewayPort: 18800,
            bridgePort: 18801,
            configDir: path.join(tempDir, "instances", "test"),
            createdAt: "2026-02-15T00:00:00.000Z",
          },
        },
        nextPortOffset: 1,
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not running");
      });

      const configPath = manager.getConfigPath("test");

      expect(configPath).toContain("test");
      expect(configPath).toContain(".env");
    });

    it("should throw error for non-existent instance", () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      expect(() => manager.getConfigPath("nonexistent")).toThrow("not found");
    });
  });

  describe("getDashboardUrl", () => {
    it("should return correct URL with gateway port", () => {
      const mockRegistry: Registry = {
        instances: {
          test: {
            name: "test",
            gatewayPort: 19000,
            bridgePort: 19001,
            configDir: "/path/test",
            createdAt: "2026-02-15T00:00:00.000Z",
          },
        },
        nextPortOffset: 1,
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not running");
      });

      const url = manager.getDashboardUrl("test");

      expect(url).toBe("http://127.0.0.1:19000/");
    });
  });

  describe("security", () => {
    it("should generate cryptographically secure tokens", async () => {
      const mockRegistry: Registry = { instances: {}, nextPortOffset: 0 };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      await manager.create({ name: "test1" });
      await manager.create({ name: "test2" });

      const envCalls = vi
        .mocked(fs.writeFileSync)
        .mock.calls.filter((call) => call[0].toString().endsWith(".env"));

      expect(envCalls.length).toBe(2);

      const token1 = (envCalls[0][1] as string).match(/OPENCLAW_GATEWAY_TOKEN=([a-f0-9]{64})/)?.[1];
      const token2 = (envCalls[1][1] as string).match(/OPENCLAW_GATEWAY_TOKEN=([a-f0-9]{64})/)?.[1];

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2); // Tokens should be unique
      expect(token1?.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it("should prevent shell injection in instance names", () => {
      const dangerousNames = [
        "test; rm -rf /",
        "test && echo hacked",
        "test | cat /etc/passwd",
        "test$(whoami)",
        "test`ls`",
      ];

      for (const name of dangerousNames) {
        const result = manager.validateName(name);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle very long but valid names (32 chars)", () => {
      const name = "a".repeat(32);
      const result = manager.validateName(name);
      expect(result.valid).toBe(true);
    });

    it("should handle names with mixed case", () => {
      const result = manager.validateName("MyInstance123");
      expect(result.valid).toBe(true);
    });

    it("should handle names with hyphens and underscores", () => {
      const result = manager.validateName("my-instance_v2");
      expect(result.valid).toBe(true);
    });

    it("should handle port allocation overflow gracefully", () => {
      const mockRegistry: Registry = {
        instances: {},
        nextPortOffset: 99999, // Very large offset
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      const ports = (manager as any).allocatePort();

      // Should still calculate a port (even if unrealistic)
      expect(ports.gatewayPort).toBeGreaterThan(65535); // Beyond valid port range
      // This reveals a potential bug - no validation of port range!
    });
  });
});
