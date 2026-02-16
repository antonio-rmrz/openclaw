/**
 * Unit tests for instances CLI commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as instanceManager from "./instance-manager.js";
import { instancesCli } from "./instances-cli.js";

// Mock the instance manager
vi.mock("./instance-manager.js");

// Mock child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
}));

// Mock console methods
const mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

describe("instancesCli", () => {
  let mockManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock manager
    mockManager = {
      checkDocker: vi.fn(() => ({ available: true })),
      listInstances: vi.fn(() => []),
      getInstance: vi.fn(),
      create: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      buildImage: vi.fn(),
      streamLogs: vi.fn(() => ({
        on: vi.fn(),
      })),
      getConfigPath: vi.fn(() => "/path/to/config"),
      getDashboardUrl: vi.fn(() => "http://localhost:18800"),
      runCli: vi.fn(() => ({
        on: vi.fn(),
      })),
    };

    vi.mocked(instanceManager.getInstanceManager).mockReturnValue(mockManager);
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  describe("list", () => {
    it("should display empty state when no instances exist", async () => {
      mockManager.listInstances.mockReturnValue([]);

      await instancesCli.list();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("No instances found"));
    });

    it("should display instances in table format", async () => {
      mockManager.listInstances.mockReturnValue([
        {
          name: "test",
          gatewayPort: 18800,
          bridgePort: 18801,
          status: "running",
          createdAt: "2026-02-15T00:00:00.000Z",
        },
        {
          name: "prod",
          gatewayPort: 18810,
          bridgePort: 18811,
          status: "stopped",
          createdAt: "2026-02-14T00:00:00.000Z",
        },
      ]);

      await instancesCli.list();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("OpenClaw Instances"));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("test"));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("prod"));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("18800"));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("18810"));
    });

    it("should output JSON when --json flag is set", async () => {
      const instances = [
        {
          name: "test",
          gatewayPort: 18800,
          bridgePort: 18801,
          status: "running",
          createdAt: "2026-02-15T00:00:00.000Z",
        },
      ];

      mockManager.listInstances.mockReturnValue(instances);

      await instancesCli.list({ json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(instances, null, 2));
    });
  });

  describe("create", () => {
    it("should create instance and start it", async () => {
      const instance = {
        name: "test",
        gatewayPort: 18800,
        bridgePort: 18801,
        configDir: "/path/test",
        createdAt: "2026-02-15T00:00:00.000Z",
      };

      mockManager.create.mockResolvedValue(instance);
      mockManager.start.mockResolvedValue(undefined);

      await instancesCli.create("test");

      expect(mockManager.create).toHaveBeenCalledWith({ name: "test", port: undefined });
      expect(mockManager.start).toHaveBeenCalledWith("test");
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Instance 'test' created and running!"),
      );
    });

    it("should create instance with custom port", async () => {
      const instance = {
        name: "test",
        gatewayPort: 19000,
        bridgePort: 19001,
        configDir: "/path/test",
        createdAt: "2026-02-15T00:00:00.000Z",
      };

      mockManager.create.mockResolvedValue(instance);
      mockManager.start.mockResolvedValue(undefined);

      await instancesCli.create("test", { port: "19000" });

      expect(mockManager.create).toHaveBeenCalledWith({ name: "test", port: 19000 });
    });

    it("should exit with error when Docker is not available", async () => {
      mockManager.checkDocker.mockReturnValue({
        available: false,
        error: "Docker is not installed",
      });

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await instancesCli.create("test");

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Docker is not installed"),
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it("should handle creation errors gracefully", async () => {
      mockManager.create.mockRejectedValue(new Error("Instance 'test' already exists"));

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await instancesCli.create("test");

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("already exists"));
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe("destroy", () => {
    it("should require --force flag", async () => {
      mockManager.getInstance.mockReturnValue({
        name: "test",
        status: "stopped",
      });

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await instancesCli.destroy("test", {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Use --force to skip this confirmation"),
      );
      expect(mockManager.destroy).not.toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it("should destroy instance when --force is provided", async () => {
      mockManager.getInstance.mockReturnValue({
        name: "test",
        status: "stopped",
        configDir: "/path/test",
      });

      await instancesCli.destroy("test", { force: true });

      expect(mockManager.destroy).toHaveBeenCalledWith({ name: "test", keepData: undefined });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Instance 'test' destroyed"),
      );
    });

    it("should preserve data when --keep-data is set", async () => {
      mockManager.getInstance.mockReturnValue({
        name: "test",
        status: "stopped",
        configDir: "/path/test",
      });

      await instancesCli.destroy("test", { force: true, keepData: true });

      expect(mockManager.destroy).toHaveBeenCalledWith({ name: "test", keepData: true });
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("Data preserved"));
    });

    it("should exit with error for non-existent instance", async () => {
      mockManager.getInstance.mockReturnValue(null);

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await instancesCli.destroy("nonexistent", { force: true });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Instance 'nonexistent' not found"),
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe("start", () => {
    it("should start instance successfully", async () => {
      mockManager.getInstance.mockReturnValue({
        name: "test",
        gatewayPort: 18800,
        status: "stopped",
      });

      await instancesCli.start("test");

      expect(mockManager.start).toHaveBeenCalledWith("test");
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Instance 'test' started"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("http://127.0.0.1:18800"),
      );
    });

    it("should exit with error for non-existent instance", async () => {
      mockManager.getInstance.mockReturnValue(null);

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await instancesCli.start("nonexistent");

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("not found"));
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe("stop", () => {
    it("should stop instance successfully", async () => {
      mockManager.getInstance.mockReturnValue({
        name: "test",
        status: "running",
      });

      await instancesCli.stop("test");

      expect(mockManager.stop).toHaveBeenCalledWith("test");
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Instance 'test' stopped"),
      );
    });
  });

  describe("config", () => {
    it("should open config file in editor", async () => {
      mockManager.getInstance.mockReturnValue({
        name: "test",
        configDir: "/path/test",
      });

      mockManager.getConfigPath.mockReturnValue("/path/test/.env");

      // Mock spawn to return immediately
      const { spawn } = await import("node:child_process");
      const mockSpawn = vi.mocked(spawn);
      const mockProc = {
        on: vi.fn((event, callback) => {
          if (event === "close") {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      await instancesCli.config("test");

      expect(mockManager.getConfigPath).toHaveBeenCalledWith("test");
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Opening config: /path/test/.env"),
      );
    });
  });

  describe("dashboard", () => {
    it("should open dashboard URL in browser", async () => {
      mockManager.getInstance.mockReturnValue({
        name: "test",
        gatewayPort: 18800,
      });

      mockManager.getDashboardUrl.mockReturnValue("http://127.0.0.1:18800/");

      const { execSync } = await import("node:child_process");
      vi.mocked(execSync).mockReturnValue(Buffer.from(""));

      await instancesCli.dashboard("test");

      expect(mockManager.getDashboardUrl).toHaveBeenCalledWith("test");
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Opening dashboard: http://127.0.0.1:18800/"),
      );
    });
  });

  describe("build", () => {
    it("should build Docker image", async () => {
      await instancesCli.build();

      expect(mockManager.buildImage).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Image built successfully"),
      );
    });

    it("should handle build errors", async () => {
      mockManager.buildImage.mockRejectedValue(new Error("Build failed"));

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await instancesCli.build();

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("Build failed"));
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });
});
