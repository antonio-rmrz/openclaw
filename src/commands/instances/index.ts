/**
 * Multi-instance management command
 *
 * Provides both interactive TUI and CLI modes for managing multiple
 * OpenClaw Docker instances.
 */

import type { Command } from "commander";
import { instancesCli } from "./instances-cli.js";
import { runInstancesTui } from "./instances-tui.js";

export function registerInstancesCommand(program: Command) {
  const instances = program
    .command("instances")
    .alias("i")
    .description("Manage multiple OpenClaw Docker instances")
    .action(async () => {
      // Default: run TUI
      await runInstancesTui();
    });

  // List all instances
  instances
    .command("list")
    .alias("ls")
    .description("List all instances")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      await instancesCli.list(options);
    });

  // Create a new instance
  instances
    .command("create <name>")
    .alias("new")
    .description("Create a new instance")
    .option("--port <port>", "Gateway port (default: auto-allocate)")
    .action(async (name, options) => {
      await instancesCli.create(name, options);
    });

  // Destroy an instance
  instances
    .command("destroy <name>")
    .alias("rm")
    .description("Destroy an instance")
    .option("--force", "Skip confirmation")
    .option("--keep-data", "Preserve config and data files")
    .action(async (name, options) => {
      await instancesCli.destroy(name, options);
    });

  // Start an instance
  instances
    .command("start <name>")
    .alias("up")
    .description("Start an instance")
    .action(async (name) => {
      await instancesCli.start(name);
    });

  // Stop an instance
  instances
    .command("stop <name>")
    .alias("down")
    .description("Stop an instance")
    .action(async (name) => {
      await instancesCli.stop(name);
    });

  // View logs
  instances
    .command("logs <name>")
    .description("View instance logs")
    .option("--no-follow", "Don't follow logs")
    .action(async (name, options) => {
      await instancesCli.logs(name, { follow: options.follow !== false });
    });

  // Edit config
  instances
    .command("config <name>")
    .alias("edit")
    .description("Edit instance configuration")
    .action(async (name) => {
      await instancesCli.config(name);
    });

  // Open dashboard
  instances
    .command("dashboard <name>")
    .alias("open")
    .description("Open instance dashboard in browser")
    .action(async (name) => {
      await instancesCli.dashboard(name);
    });

  // Run CLI command
  instances
    .command("cli <name> [args...]")
    .alias("run")
    .description("Run CLI command in instance")
    .action(async (name, args) => {
      await instancesCli.cli(name, args);
    });

  // Build Docker image
  instances
    .command("build")
    .description("Build the OpenClaw Docker image")
    .action(async () => {
      await instancesCli.build();
    });
}
