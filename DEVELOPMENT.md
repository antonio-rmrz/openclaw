# OpenClaw Development Guide

## Quick Start

### Running Commands During Development

OpenClaw provides multiple ways to run commands. Choose the one that fits your workflow:

#### Option 1: Local Wrapper (Recommended for Development)

```bash
./oc instances list           # Long form
./oc i ls                     # With aliases
./oc i new dev               # Create instance
./oc i start dev             # Start instance
```

**Pros**: Fastest, shortest syntax, uses smart auto-compilation
**Cons**: Requires `./` prefix

#### Option 2: NPM Scripts

```bash
pnpm oc i ls                 # General shorthand
pnpm i:ls                    # Task-specific
pnpm i:new dev              # Create instance
```

**Pros**: Familiar npm/pnpm workflow, IDE auto-completion
**Cons**: Still requires `pnpm` prefix

#### Option 3: Global Install

```bash
# Update global install first:
pnpm link --global

# Then use from anywhere:
openclaw instances list
openclaw i ls
```

**Pros**: Works from anywhere on your system, no prefix needed
**Cons**: Requires updating after pulling changes

#### Option 4: Direct Execution

```bash
./openclaw.mjs i ls          # Uses smart runner
node openclaw.mjs i ls       # Alternative
```

**Pros**: Explicit, shows what's happening
**Cons**: More typing than wrapper

## First-Time Setup

Run the setup helper to check your environment:

```bash
./oc setup dev
```

This will:

- ✅ Check if your global installation is current
- ✅ Verify local wrapper scripts exist
- ✅ Show all available shortcuts
- ✅ Provide shell alias instructions
- ✅ Display quick reference guide

## Common Instance Management Tasks

### List Instances

```bash
./oc i ls                    # Table format
./oc i list                  # JSON format (via i:list script)
pnpm i:ls                    # Using npm script
```

### Create Instance

```bash
./oc i new <name>                    # Auto-allocate port
./oc i new prod --port 20000         # Custom port
pnpm i:new dev                       # Using npm script
```

### Start/Stop Instances

```bash
./oc i start <name>          # Start instance
./oc i stop <name>           # Stop instance
pnpm i:start dev             # Using npm script
pnpm i:stop dev              # Using npm script
```

### View Logs

```bash
./oc i logs <name>           # Follow logs (live tail)
./oc i logs <name> --no-follow   # Static view
pnpm i:logs dev              # Using npm script
```

### Edit Configuration

```bash
./oc i config <name>         # Opens .env in $EDITOR
./oc i edit <name>           # Alias for config
```

### Access Dashboard

```bash
./oc i dashboard <name>      # Opens browser
./oc i open <name>           # Alias for dashboard
```

### Run Onboarding Wizard

After creating an instance, run the wizard to configure it:

```bash
./oc i wizard <name>                    # Default quickstart flow
./oc i wizard <name> --flow quickstart  # Explicit quickstart
./oc i wizard <name> --flow advanced    # Advanced options
./oc i wizard <name> --reset            # Reset and reconfigure
```

The wizard will guide you through:
- AI provider authentication (Anthropic API, OpenAI, etc.)
- Agent workspace configuration
- Channel setup (Discord, WhatsApp, Telegram)
- Skill installations (optional)

**Note**: The wizard is optional. Instances work with `--allow-unconfigured` but need provider credentials for AI functionality.

### Destroy Instance

```bash
./oc i rm <name>             # Keeps data
./oc i rm <name> --force     # Deletes everything
```

### Interactive TUI

```bash
./oc instances               # Launches Terminal UI
./oc i                       # Shorthand
pnpm i:tui                   # Using npm script
```

## Command Aliases Reference

### Top-Level Commands

- `instances` → `i`

### Instance Subcommands

- `list` → `ls`
- `create` → `new`
- `destroy` → `rm`
- `start` → `up`
- `stop` → `down`
- `config` → `edit`
- `dashboard` → `open`
- `cli` → `run`

## Shell Alias (Optional Power-User Setup)

For the absolute shortest commands, add a shell alias:

### Zsh (macOS default)

Add to `~/.zshrc`:

```bash
alias oc='/Users/peperamirez/Dev/openclaw/openclaw.mjs'
```

Then reload:

```bash
source ~/.zshrc
```

### Bash

Add to `~/.bashrc`:

```bash
alias oc='/Users/peperamirez/Dev/openclaw/openclaw.mjs'
```

Then reload:

```bash
source ~/.bashrc
```

### Usage After Setup

```bash
oc i ls                      # No ./ prefix needed!
oc i new dev                 # Ultra-short syntax
oc i start dev               # Maximum convenience
```

## Why NOT `node dist/index.js`?

If you've been using `node dist/index.js instances list`, here's why you should switch:

### Problems with Direct dist/ Execution

❌ **Bypasses smart build system**

- No auto-compilation when source changes
- Have to manually run `pnpm build` every time

❌ **Misses build optimizations**

- Doesn't use cached builds
- Slower startup time

❌ **More typing**

- 31 characters vs 9 characters (`./oc i ls`)
- 3+ seconds to type vs 1 second

❌ **Not the intended entry point**

- `dist/index.js` is compiled output
- Proper entry is `openclaw.mjs`

### Better Alternatives

✅ **Use `./oc` wrapper**:

```bash
./oc i ls                    # 9 characters, auto-compiles
```

✅ **Use `./openclaw.mjs`**:

```bash
./openclaw.mjs i ls          # 19 characters, auto-compiles
```

✅ **Use npm scripts**:

```bash
pnpm i:ls                    # 9 characters, auto-compiles
```

✅ **Use global install**:

```bash
openclaw i ls                # 13 characters, works anywhere
```

## Build System

OpenClaw uses a smart build system that:

1. **Detects changes** - Compares timestamps and git HEAD
2. **Auto-compiles** - Rebuilds TypeScript only when needed
3. **Caches builds** - Skips unnecessary compilations
4. **Fast startup** - Uses cached results when possible

### The Smart Runner

When you run `./oc` or `./openclaw.mjs`, it:

```
./oc → openclaw.mjs → scripts/run-node.mjs → dist/entry.js
         ↓                    ↓
    Bootstrap           Smart Builder
                    (compiles if needed)
```

### Manual Build (When Needed)

```bash
pnpm build                   # Full build
pnpm build:fast              # Skip type checking
```

Usually you don't need manual builds - the smart runner handles it!

## Updating Global Install

After pulling new changes, update your global installation:

```bash
git pull
pnpm link --global           # Re-link to update
```

Verify it worked:

```bash
openclaw --version           # Should match package.json
openclaw i ls                # Should have latest features
```

## NPM Scripts Reference

### General Commands

| Script        | Command                 | Description       |
| ------------- | ----------------------- | ----------------- |
| `pnpm oc ...` | `node openclaw.mjs ...` | General shorthand |

### Instance Management

| Script         | Command                                   | Description      |
| -------------- | ----------------------------------------- | ---------------- |
| `pnpm i:ls`    | `node openclaw.mjs instances list`        | List instances   |
| `pnpm i:list`  | `node openclaw.mjs instances list --json` | List as JSON     |
| `pnpm i:new`   | `node openclaw.mjs instances create`      | Create instance  |
| `pnpm i:rm`    | `node openclaw.mjs instances destroy`     | Destroy instance |
| `pnpm i:start` | `node openclaw.mjs instances start`       | Start instance   |
| `pnpm i:stop`  | `node openclaw.mjs instances stop`        | Stop instance    |
| `pnpm i:logs`  | `node openclaw.mjs instances logs`        | View logs        |
| `pnpm i:tui`   | `node openclaw.mjs instances`             | Interactive TUI  |

## Troubleshooting

### "command not found: openclaw"

Your global install is missing or not in PATH.

**Solution**:

```bash
pnpm link --global
```

### "Global install is outdated"

Run `./oc setup dev` and it shows version mismatch.

**Solution**:

```bash
pnpm link --global           # Update global install
./oc setup dev               # Verify it worked
```

### "./oc: Permission denied"

The wrapper isn't executable.

**Solution**:

```bash
chmod +x oc
```

### "Module not found" errors

Build is out of sync.

**Solution**:

```bash
pnpm build                   # Rebuild everything
./oc i ls                    # Should work now
```

### Changes not reflected

Smart runner cached old build.

**Solution**:

```bash
OPENCLAW_FORCE_BUILD=1 ./oc i ls    # Force rebuild
```

## Development Workflow Examples

### Quick Instance Test

```bash
./oc i new test-feature
./oc i start test-feature
./oc i logs test-feature --no-follow
./oc i rm test-feature --force
```

### Multi-Environment Setup

```bash
./oc i new dev
./oc i new staging --port 19200
./oc i new prod --port 20000
./oc i start dev
./oc i start staging
./oc i ls
```

### Debug Instance

```bash
./oc i new debug
./oc i config debug              # Add API keys
./oc i start debug
./oc i logs debug --follow       # Watch logs live
```

## Tips & Best Practices

### 1. Use the Wrapper

✅ **Do**: `./oc i ls`
❌ **Don't**: `node dist/index.js instances list`

### 2. Leverage Aliases

✅ **Do**: `./oc i ls` (short form)
❌ **Don't**: `./oc instances list` (long form)

### 3. Keep Global Install Updated

```bash
# After git pull, always:
pnpm link --global
```

### 4. Use Task-Specific Scripts

```bash
pnpm i:ls                    # Better than pnpm oc i ls
pnpm i:start dev             # Clear and concise
```

### 5. Add Shell Alias for Speed

```bash
alias oc='./openclaw.mjs'    # Ultimate shortcut
oc i ls                      # Fastest possible
```

## Quick Reference Card

| Goal             | Command                 | Length   |
| ---------------- | ----------------------- | -------- |
| List instances   | `./oc i ls`             | 9 chars  |
| Create instance  | `./oc i new dev`        | 15 chars |
| Start instance   | `./oc i start dev`      | 17 chars |
| View logs        | `./oc i logs dev`       | 16 chars |
| Destroy instance | `./oc i rm dev --force` | 22 chars |

Compare to old way: `node dist/index.js instances list` = **31 chars**

**Improvement**: 71% reduction in typing! ⚡

## Contributing

When contributing to OpenClaw:

1. **Always use `./oc` or npm scripts** - Don't commit workflows based on `node dist/index.js`
2. **Test with auto-compilation** - Make sure smart runner works
3. **Update global install** - Before testing CLI changes
4. **Run `./oc setup dev`** - To verify environment

## Getting Help

```bash
./oc --help                  # General help
./oc instances --help        # Instance commands help
./oc i ls --help             # Specific command help
./oc setup dev               # Environment check
```

## See Also

- [README.md](README.md) - Project overview and installation
- [docs/](docs/) - Full documentation
- [skills/](skills/) - Available skills and plugins

---

**Have questions?** Run `./oc setup dev` to check your environment and see all shortcuts!
