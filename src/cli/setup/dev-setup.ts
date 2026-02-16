import chalk from "chalk";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

export async function setupDevCommand() {
  console.log(chalk.bold("\n🚀 OpenClaw Development Environment Setup\n"));

  // 1. Check global install status
  console.log(chalk.cyan("1. Checking global installation..."));
  const globalInstallOk = checkGlobalInstall();

  if (!globalInstallOk) {
    console.log(chalk.yellow("   Global install is outdated or missing."));
    console.log(chalk.gray("   Run: pnpm link --global"));
    console.log(chalk.gray("   OR:  npm install -g ."));
  } else {
    console.log(chalk.green("   ✓ Global install is current"));
  }

  // 2. Check local wrapper
  console.log(chalk.cyan("\n2. Checking local wrapper scripts..."));
  const wrapperExists = existsSync("./oc");
  if (wrapperExists) {
    console.log(chalk.green("   ✓ ./oc wrapper exists"));
  } else {
    console.log(chalk.yellow("   Local wrapper not found (should exist in repo)"));
  }

  // 3. Show available shortcuts
  console.log(chalk.cyan("\n3. Available Development Shortcuts:\n"));
  console.log(chalk.bold("   Local wrapper:"));
  console.log(chalk.gray("     ./oc i ls              # List instances"));
  console.log(chalk.gray("     ./oc i new dev         # Create instance"));
  console.log(chalk.gray("     ./oc i start dev       # Start instance"));

  console.log(chalk.bold("\n   NPM scripts:"));
  console.log(chalk.gray("     pnpm oc i ls           # General shorthand"));
  console.log(chalk.gray("     pnpm i:ls              # Task-specific"));
  console.log(chalk.gray("     pnpm i:new dev         # Create instance"));

  console.log(chalk.bold("\n   Global command (if installed):"));
  console.log(chalk.gray("     openclaw i ls          # Anywhere on system"));

  console.log(chalk.bold("\n   Direct execution:"));
  console.log(chalk.gray("     ./openclaw.mjs i ls    # Uses smart runner"));

  // 4. Offer shell alias setup
  console.log(chalk.cyan("\n4. Optional Shell Alias:\n"));
  const shell = process.env.SHELL || "";
  const shellConfig = shell.includes("zsh") ? "~/.zshrc" : "~/.bashrc";

  console.log(chalk.gray(`   Add to ${shellConfig}:`));
  console.log(chalk.yellow(`   alias oc='${process.cwd()}/openclaw.mjs'`));
  console.log(chalk.gray(`   Then run: source ${shellConfig}`));
  console.log(chalk.gray("   Usage:    oc i ls"));

  // 5. Summary
  console.log(chalk.cyan("\n5. Quick Reference:\n"));
  console.log(chalk.gray("   Shortest:  oc i ls           (with shell alias)"));
  console.log(chalk.gray("   Local:     ./oc i ls         (wrapper script)"));
  console.log(chalk.gray("   NPM:       pnpm i:ls         (npm scripts)"));
  console.log(chalk.gray("   Global:    openclaw i ls     (global install)"));

  console.log(chalk.green("\n✅ Setup check complete!\n"));
}

function checkGlobalInstall(): boolean {
  try {
    const globalVersion = execSync("openclaw --version", { encoding: "utf-8" }).trim();
    const localVersion = readFileSync("./package.json", "utf-8");
    const localPkgVersion = JSON.parse(localVersion).version;

    return globalVersion === localPkgVersion;
  } catch {
    return false;
  }
}
