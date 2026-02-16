/**
 * CLI commands for instance management (non-interactive)
 */

import chalk from "chalk";
import { execSync, spawn } from "node:child_process";
import type { InstanceWithStatus } from "./instance-types.js";
import { getInstanceManager } from "./instance-manager.js";

const manager = getInstanceManager();

function formatStatus(status: InstanceWithStatus["status"]): string {
  switch (status) {
    case "running":
      return chalk.green("running");
    case "stopped":
      return chalk.yellow("stopped");
    default:
      return chalk.gray("unknown");
  }
}

export const instancesCli = {
  /**
   * List all instances
   */
  async list(options: { json?: boolean } = {}): Promise<void> {
    const instances = manager.listInstances();

    if (options.json) {
      console.log(JSON.stringify(instances, null, 2));
      return;
    }

    if (instances.length === 0) {
      console.log(chalk.gray("No instances found."));
      console.log(chalk.gray("Create one with: openclaw instances create <name>"));
      return;
    }

    console.log();
    console.log(chalk.bold("OpenClaw Instances"));
    console.log();

    // Table header
    const cols = {
      name: 15,
      gateway: 8,
      bridge: 8,
      status: 10,
      created: 12,
    };

    console.log(
      chalk.gray(
        `${"NAME".padEnd(cols.name)} ${"GATEWAY".padEnd(cols.gateway)} ${"BRIDGE".padEnd(cols.bridge)} ${"STATUS".padEnd(cols.status)} ${"CREATED".padEnd(cols.created)}`,
      ),
    );
    console.log(
      chalk.gray(
        `${"─".repeat(cols.name)} ${"─".repeat(cols.gateway)} ${"─".repeat(cols.bridge)} ${"─".repeat(cols.status)} ${"─".repeat(cols.created)}`,
      ),
    );

    for (const instance of instances) {
      const created = instance.createdAt.split("T")[0] ?? "";
      console.log(
        `${instance.name.padEnd(cols.name)} ${String(instance.gatewayPort).padEnd(cols.gateway)} ${String(instance.bridgePort).padEnd(cols.bridge)} ${formatStatus(instance.status).padEnd(cols.status + 10)} ${created.padEnd(cols.created)}`,
      );
    }
    console.log();
  },

  /**
   * Create a new instance
   */
  async create(name: string, options: { port?: string } = {}): Promise<void> {
    // Check Docker availability
    const dockerCheck = manager.checkDocker();
    if (!dockerCheck.available) {
      console.error(chalk.red(`Error: ${dockerCheck.error}`));
      process.exit(1);
    }

    const port = options.port ? parseInt(options.port, 10) : undefined;

    console.log(chalk.cyan(`Creating instance: ${name}`));

    try {
      const instance = await manager.create({ name, port });
      console.log(chalk.green(`  Gateway port: ${instance.gatewayPort}`));
      console.log(chalk.green(`  Bridge port:  ${instance.bridgePort}`));
      console.log(chalk.green(`  Config dir:   ${instance.configDir}`));

      // Check if image exists
      try {
        execSync("docker image inspect openclaw:local >/dev/null 2>&1", { stdio: "pipe" });
      } catch {
        console.log();
        console.log(chalk.yellow("Docker image not found. Building..."));
        await manager.buildImage((data) => process.stdout.write(data));
      }

      // Start the instance
      console.log();
      console.log(chalk.cyan("Starting gateway..."));
      await manager.start(name);

      console.log();
      console.log(chalk.green.bold(`Instance '${name}' created and running!`));
      console.log(chalk.cyan(`  Dashboard: http://127.0.0.1:${instance.gatewayPort}/`));
      console.log();
      console.log(chalk.gray("Commands:"));
      console.log(chalk.gray(`  openclaw instances logs ${name}     - View logs`));
      console.log(chalk.gray(`  openclaw instances config ${name}   - Edit configuration`));
      console.log(chalk.gray(`  openclaw instances destroy ${name}  - Remove instance`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },

  /**
   * Destroy an instance
   */
  async destroy(
    name: string,
    options: { force?: boolean; keepData?: boolean } = {},
  ): Promise<void> {
    const instance = manager.getInstance(name);
    if (!instance) {
      console.error(chalk.red(`Error: Instance '${name}' not found`));
      process.exit(1);
    }

    if (!options.force) {
      console.log(chalk.yellow(`This will destroy instance '${name}' and all its data.`));
      console.log(
        chalk.yellow("Use --force to skip this confirmation, or --keep-data to preserve files."),
      );
      process.exit(1);
    }

    console.log(chalk.yellow(`Destroying instance: ${name}`));

    try {
      await manager.destroy({ name, keepData: options.keepData });
      console.log(chalk.green(`Instance '${name}' destroyed.`));
      if (options.keepData) {
        console.log(chalk.gray(`Data preserved at: ${instance.configDir}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },

  /**
   * Start an instance
   */
  async start(name: string): Promise<void> {
    const instance = manager.getInstance(name);
    if (!instance) {
      console.error(chalk.red(`Error: Instance '${name}' not found`));
      process.exit(1);
    }

    console.log(chalk.cyan(`Starting instance: ${name}`));

    try {
      await manager.start(name);
      console.log(chalk.green(`Instance '${name}' started.`));
      console.log(chalk.cyan(`Dashboard: http://127.0.0.1:${instance.gatewayPort}/`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },

  /**
   * Stop an instance
   */
  async stop(name: string): Promise<void> {
    const instance = manager.getInstance(name);
    if (!instance) {
      console.error(chalk.red(`Error: Instance '${name}' not found`));
      process.exit(1);
    }

    console.log(chalk.yellow(`Stopping instance: ${name}`));

    try {
      await manager.stop(name);
      console.log(chalk.green(`Instance '${name}' stopped.`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },

  /**
   * View logs for an instance
   */
  async logs(name: string, options: { follow?: boolean } = { follow: true }): Promise<void> {
    const instance = manager.getInstance(name);
    if (!instance) {
      console.error(chalk.red(`Error: Instance '${name}' not found`));
      process.exit(1);
    }

    const proc = manager.streamLogs(name, options.follow);
    proc.on("close", (code) => {
      process.exit(code ?? 0);
    });
  },

  /**
   * Open config file
   */
  async config(name: string): Promise<void> {
    const instance = manager.getInstance(name);
    if (!instance) {
      console.error(chalk.red(`Error: Instance '${name}' not found`));
      process.exit(1);
    }

    const configPath = manager.getConfigPath(name);
    const editor = process.env.EDITOR || "vim";

    console.log(chalk.cyan(`Opening config: ${configPath}`));
    console.log(chalk.gray(`Editor: ${editor}`));
    console.log();

    const proc = spawn(editor, [configPath], { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log();
        console.log(chalk.yellow("Config updated. Restart to apply changes:"));
        console.log(
          chalk.gray(`  openclaw instances stop ${name} && openclaw instances start ${name}`),
        );
      }
      process.exit(code ?? 0);
    });
  },

  /**
   * Run CLI command in instance
   */
  async cli(name: string, args: string[]): Promise<void> {
    const instance = manager.getInstance(name);
    if (!instance) {
      console.error(chalk.red(`Error: Instance '${name}' not found`));
      process.exit(1);
    }

    const proc = manager.runCli(name, args);
    proc.on("close", (code) => {
      process.exit(code ?? 0);
    });
  },

  /**
   * Open dashboard in browser
   */
  async dashboard(name: string): Promise<void> {
    const instance = manager.getInstance(name);
    if (!instance) {
      console.error(chalk.red(`Error: Instance '${name}' not found`));
      process.exit(1);
    }

    const url = manager.getDashboardUrl(name);
    console.log(chalk.cyan(`Opening dashboard: ${url}`));

    // Try to open in browser
    const openCommand =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      execSync(`${openCommand} "${url}"`, { stdio: "ignore" });
    } catch {
      console.log(chalk.gray(`Could not open browser. Visit: ${url}`));
    }
  },

  /**
   * Build Docker image
   */
  async build(): Promise<void> {
    console.log(chalk.cyan("Building OpenClaw Docker image..."));
    try {
      await manager.buildImage((data) => process.stdout.write(data));
      console.log(chalk.green("Image built successfully: openclaw:local"));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },
};
