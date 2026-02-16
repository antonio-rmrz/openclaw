/**
 * Interactive TUI for managing instances
 */

import { confirm, intro, isCancel, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import { execSync } from "node:child_process";
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

function formatInstanceLabel(instance: InstanceWithStatus): string {
  const status = formatStatus(instance.status);
  const port = chalk.dim(`:${instance.gatewayPort}`);
  return `${instance.name}${port}  ${status}`;
}

async function handleCreate(): Promise<void> {
  const name = await text({
    message: "Instance name:",
    placeholder: "my-instance",
    validate: (value) => {
      const result = manager.validateName(value);
      return result.valid ? undefined : result.error;
    },
  });

  if (isCancel(name)) {
    return;
  }

  const useCustomPort = await confirm({
    message: "Use custom port? (default: auto-allocate)",
    initialValue: false,
  });

  if (isCancel(useCustomPort)) {
    return;
  }

  let port: number | undefined;
  if (useCustomPort) {
    const portStr = await text({
      message: "Gateway port:",
      placeholder: "18800",
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1024 || num > 65535) {
          return "Port must be between 1024 and 65535";
        }
        return undefined;
      },
    });
    if (isCancel(portStr)) {
      return;
    }
    port = parseInt(portStr, 10);
  }

  const spin = spinner();
  spin.start("Creating instance...");

  try {
    // Check if image exists
    let needsBuild = false;
    try {
      execSync("docker image inspect openclaw:local >/dev/null 2>&1", { stdio: "pipe" });
    } catch {
      needsBuild = true;
    }

    if (needsBuild) {
      spin.message("Building Docker image (this may take a while)...");
      await manager.buildImage();
    }

    const instance = await manager.create({ name, port });
    spin.message("Starting gateway...");
    await manager.start(name);

    spin.stop(chalk.green(`Instance '${name}' created!`));
    console.log();
    console.log(chalk.cyan(`  Dashboard: http://127.0.0.1:${instance.gatewayPort}/`));
    console.log(chalk.dim(`  Config:    ${instance.configDir}/.env`));
    console.log();
  } catch (error) {
    spin.stop(chalk.red("Failed to create instance"));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleStart(instance: InstanceWithStatus): Promise<void> {
  const spin = spinner();
  spin.start(`Starting ${instance.name}...`);

  try {
    await manager.start(instance.name);
    spin.stop(chalk.green(`Instance '${instance.name}' started!`));
    console.log(chalk.cyan(`  Dashboard: http://127.0.0.1:${instance.gatewayPort}/`));
  } catch (error) {
    spin.stop(chalk.red("Failed to start instance"));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleStop(instance: InstanceWithStatus): Promise<void> {
  const spin = spinner();
  spin.start(`Stopping ${instance.name}...`);

  try {
    await manager.stop(instance.name);
    spin.stop(chalk.green(`Instance '${instance.name}' stopped.`));
  } catch (error) {
    spin.stop(chalk.red("Failed to stop instance"));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleDelete(instance: InstanceWithStatus): Promise<void> {
  const confirmed = await confirm({
    message: `Delete instance '${instance.name}'? This will remove all data.`,
    initialValue: false,
  });

  if (isCancel(confirmed) || !confirmed) {
    return;
  }

  const spin = spinner();
  spin.start(`Deleting ${instance.name}...`);

  try {
    await manager.destroy({ name: instance.name, force: true });
    spin.stop(chalk.green(`Instance '${instance.name}' deleted.`));
  } catch (error) {
    spin.stop(chalk.red("Failed to delete instance"));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleConfig(instance: InstanceWithStatus): Promise<void> {
  const configPath = manager.getConfigPath(instance.name);
  const editor = process.env.EDITOR || "vim";

  console.log(chalk.dim(`Opening ${configPath} in ${editor}...`));
  console.log(chalk.dim("Press any key after editing to continue."));

  try {
    execSync(`${editor} "${configPath}"`, { stdio: "inherit" });
    console.log();
    console.log(chalk.yellow("Config updated. Restart instance to apply changes."));
  } catch {
    console.log(chalk.dim(`Could not open editor. Edit manually: ${configPath}`));
  }
}

async function handleLogs(instance: InstanceWithStatus): Promise<void> {
  console.log(chalk.dim("Following logs... Press Ctrl+C to stop."));
  console.log();

  const proc = manager.streamLogs(instance.name, true);

  // Wait for user interrupt
  await new Promise<void>((resolve) => {
    proc.on("close", () => resolve());
    proc.on("error", () => resolve());
  });
}

async function handleDashboard(instance: InstanceWithStatus): Promise<void> {
  const url = manager.getDashboardUrl(instance.name);
  console.log(chalk.cyan(`Opening: ${url}`));

  const openCommand =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    execSync(`${openCommand} "${url}"`, { stdio: "ignore" });
  } catch {
    console.log(chalk.dim(`Could not open browser. Visit: ${url}`));
  }
}

type Action = "create" | "start" | "stop" | "delete" | "config" | "logs" | "dashboard" | "quit";

async function selectInstance(): Promise<InstanceWithStatus | null> {
  const instances = manager.listInstances();

  if (instances.length === 0) {
    return null;
  }

  const result = await select({
    message: "Select instance:",
    options: instances.map((instance) => ({
      value: instance.name,
      label: formatInstanceLabel(instance),
    })),
  });

  if (isCancel(result)) {
    return null;
  }

  return instances.find((i) => i.name === result) ?? null;
}

async function selectAction(instance: InstanceWithStatus | null): Promise<Action | null> {
  const options: { value: Action; label: string; hint?: string }[] = [];

  // New instance is always available
  options.push({
    value: "create",
    label: chalk.green("+ New instance"),
    hint: "Create a new instance",
  });

  if (instance) {
    if (instance.status === "running") {
      options.push({ value: "stop", label: "Stop", hint: `Stop ${instance.name}` });
      options.push({ value: "dashboard", label: "Dashboard", hint: "Open in browser" });
      options.push({ value: "logs", label: "Logs", hint: "Follow logs" });
    } else {
      options.push({ value: "start", label: "Start", hint: `Start ${instance.name}` });
    }
    options.push({ value: "config", label: "Config", hint: "Edit .env file" });
    options.push({ value: "delete", label: chalk.red("Delete"), hint: `Remove ${instance.name}` });
  }

  options.push({ value: "quit", label: chalk.dim("Quit"), hint: "Exit" });

  const result = await select({
    message: instance ? `Action for '${instance.name}':` : "Action:",
    options,
  });

  if (isCancel(result)) {
    return "quit";
  }
  return result;
}

export async function runInstancesTui(): Promise<void> {
  // Check Docker
  const dockerCheck = manager.checkDocker();
  if (!dockerCheck.available) {
    console.error(chalk.red(`Error: ${dockerCheck.error}`));
    process.exit(1);
  }

  intro(chalk.bold.cyan("OpenClaw Instance Manager"));

  let running = true;

  while (running) {
    const instances = manager.listInstances();

    // Show current instances
    if (instances.length > 0) {
      console.log();
      console.log(chalk.bold("Instances:"));
      for (const instance of instances) {
        const status = formatStatus(instance.status);
        const port = chalk.dim(`:${instance.gatewayPort}`);
        console.log(`  ${instance.name}${port}  ${status}`);
      }
      console.log();
    } else {
      console.log();
      console.log(chalk.dim("No instances yet."));
      console.log();
    }

    // Select instance (if any exist)
    let selectedInstance: InstanceWithStatus | null = null;
    if (instances.length > 0) {
      selectedInstance = await selectInstance();
      if (selectedInstance === null && instances.length > 0) {
        // User cancelled instance selection, show action menu anyway
      }
    }

    // Select action
    const action = await selectAction(selectedInstance);

    if (action === null || action === "quit") {
      running = false;
      continue;
    }

    console.log();

    switch (action) {
      case "create":
        await handleCreate();
        break;
      case "start":
        if (selectedInstance) {
          await handleStart(selectedInstance);
        }
        break;
      case "stop":
        if (selectedInstance) {
          await handleStop(selectedInstance);
        }
        break;
      case "delete":
        if (selectedInstance) {
          await handleDelete(selectedInstance);
        }
        break;
      case "config":
        if (selectedInstance) {
          await handleConfig(selectedInstance);
        }
        break;
      case "logs":
        if (selectedInstance) {
          await handleLogs(selectedInstance);
        }
        break;
      case "dashboard":
        if (selectedInstance) {
          await handleDashboard(selectedInstance);
        }
        break;
    }

    console.log();
  }

  outro(chalk.dim("Goodbye!"));
}
