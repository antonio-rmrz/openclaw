# Critical Bugs Found During Testing

## 🚨 Bug #1: Port Spacing Insufficient - CDP Port Conflicts

**File:** `src/commands/instances/instance-types.ts:34`

**Current Code:**

```typescript
export const INSTANCES_PORT_STEP = 10;
```

**Problem:**
OpenClaw uses derived ports for browser automation:

- Gateway: base port (18800)
- Bridge: base + 1 (18801)
- Browser control: base + 2 (18802)
- CDP ports: base + 2 + 9 through +108 (18811-18910)

With 10-port spacing:

- Instance 1 CDP: 18811-18910
- Instance 2 bridge: 18811 ← **CONFLICT!**

**Impact:** Second instance will fail to start or have network conflicts

**Fix:**

```typescript
export const INSTANCES_PORT_STEP = 120; // Safe spacing for all derived ports
```

**Alternative Fix:**
Update documentation to recommend `--port` with 120+ spacing manually.

---

## ⚠️ Bug #2: No Port Availability Check

**File:** `src/commands/instances/instance-manager.ts:83-91`

**Current Code:**

```typescript
private allocatePort(): { gatewayPort: number; bridgePort: number } {
  const registry = this.readRegistry();
  const offset = registry.nextPortOffset;
  const gatewayPort = INSTANCES_BASE_PORT + offset * INSTANCES_PORT_STEP;
  const bridgePort = gatewayPort + 1;
  registry.nextPortOffset = offset + 1;
  this.writeRegistry(registry);
  return { gatewayPort, bridgePort };
}
```

**Problem:**

- Allocates ports without checking if they're already in use by other processes
- `docker compose up` fails with unclear error message
- User has to debug port conflicts manually

**Impact:** Poor user experience when ports are already in use

**Fix:**

```typescript
import { createServer } from "node:net";

private async isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

private async allocatePort(): Promise<{ gatewayPort: number; bridgePort: number }> {
  const registry = this.readRegistry();
  let offset = registry.nextPortOffset;
  const maxAttempts = 1000;

  for (let i = 0; i < maxAttempts; i++) {
    const gatewayPort = INSTANCES_BASE_PORT + offset * INSTANCES_PORT_STEP;
    const bridgePort = gatewayPort + 1;

    if (
      (await this.isPortAvailable(gatewayPort)) &&
      (await this.isPortAvailable(bridgePort))
    ) {
      registry.nextPortOffset = offset + 1;
      this.writeRegistry(registry);
      return { gatewayPort, bridgePort };
    }

    offset++;
  }

  throw new Error("Could not find available ports after 1000 attempts");
}

// Update create() signature to async:
async create(options: CreateInstanceOptions): Promise<Instance> {
  // ... existing code ...
  const ports = await this.allocatePort(); // Make async
  // ... rest of code ...
}
```

---

## 📝 Bug #3: Port Offsets Never Reclaimed

**File:** `src/commands/instances/instance-manager.ts:433-462`

**Current Code:**

```typescript
async destroy(options: DestroyInstanceOptions): Promise<void> {
  // ... remove containers and data ...

  // Unregister instance
  const registry = this.readRegistry();
  delete registry.instances[name];
  this.writeRegistry(registry);
  // ❌ nextPortOffset is NOT decremented
}
```

**Problem:**

- Creating and destroying instances increments `nextPortOffset` each time
- Destroyed instance ports are never reused
- After 100 create/destroy cycles, you're at port 19800 instead of 18800

**Impact:** Wastes port space, eventually exhausts available ports

**Fix Option 1: Track available offsets**

```typescript
export interface Registry {
  instances: Record<string, Instance>;
  nextPortOffset: number;
  availableOffsets: number[]; // Add this
}

private allocatePort(): { gatewayPort: number; bridgePort: number } {
  const registry = this.readRegistry();

  // Try to reuse an available offset first
  let offset: number;
  if (registry.availableOffsets && registry.availableOffsets.length > 0) {
    offset = registry.availableOffsets.shift()!;
  } else {
    offset = registry.nextPortOffset;
    registry.nextPortOffset++;
  }

  const gatewayPort = INSTANCES_BASE_PORT + offset * INSTANCES_PORT_STEP;
  const bridgePort = gatewayPort + 1;
  this.writeRegistry(registry);
  return { gatewayPort, bridgePort };
}

async destroy(options: DestroyInstanceOptions): Promise<void> {
  const instance = this.getInstance(name);
  if (!instance) {
    throw new Error(`Instance '${name}' not found`);
  }

  // Calculate offset from port
  const offset = (instance.gatewayPort - INSTANCES_BASE_PORT) / INSTANCES_PORT_STEP;

  // ... existing cleanup code ...

  // Mark offset as available for reuse
  const registry = this.readRegistry();
  delete registry.instances[name];
  if (!registry.availableOffsets) {
    registry.availableOffsets = [];
  }
  registry.availableOffsets.push(offset);
  registry.availableOffsets.sort((a, b) => a - b); // Keep sorted
  this.writeRegistry(registry);
}
```

**Fix Option 2: Accept as-is**
This is arguably not a bug - it's a simple implementation trade-off. The port space is large enough (4,673 possible instances) that reuse isn't critical. Document this behavior instead.

---

## 🔒 Security Issue #1: Default LAN Binding

**File:** `src/commands/instances/instance-manager.ts:161-180`

**Current Code:**

```typescript
OPENCLAW_GATEWAY_BIND = lan;
```

**Problem:**

- Gateway exposes to entire local network by default
- Anyone on LAN can access the gateway if they know the token
- Should default to more restrictive binding

**Impact:** Potential unauthorized access on shared networks

**Fix:**

```typescript
OPENCLAW_GATEWAY_BIND = loopback;
```

Or add a prompt during creation:

```typescript
const binding = await confirm({
  message: "Expose gateway to LAN? (default: localhost only)",
  initialValue: false,
});

const bind = binding ? "lan" : "loopback";
```

---

## 🔒 Security Issue #2: No .env Permission Enforcement

**File:** `src/commands/instances/instance-manager.ts:379`

**Current Code:**

```typescript
fs.writeFileSync(path.join(instanceDir, ".env"), this.generateEnvFile(instance, token));
// ❌ No chmod to restrict permissions
```

**Problem:**

- .env file contains sensitive API keys and tokens
- Created with default permissions (usually 644 = world-readable)
- Other users on the system can read secrets

**Impact:** Information disclosure on multi-user systems

**Fix:**

```typescript
const envPath = path.join(instanceDir, ".env");
fs.writeFileSync(envPath, this.generateEnvFile(instance, token));
fs.chmodSync(envPath, 0o600); // rw------- (owner only)
```

---

## Summary of Required Changes

### High Priority

1. ✅ Increase `INSTANCES_PORT_STEP` to 120
2. ✅ Add port availability checking
3. ✅ Change default binding to `loopback`
4. ✅ Set .env permissions to 600

### Medium Priority

5. ⚠️ Implement port offset reclamation (or document behavior)
6. ⚠️ Add validation for port number overflow (>65535)

### Low Priority

7. 📝 Add restart command
8. 📝 Add status command
9. 📝 Add registry.json corruption handling

---

## Testing These Fixes

After implementing fixes, run:

```bash
# Test port spacing
pnpm test src/commands/instances/instance-manager.test.ts -t "port allocation"

# Test port availability
pnpm test src/commands/instances/instance-manager.test.ts -t "should detect port conflicts"

# Test security
pnpm test src/commands/instances/instance-manager.test.ts -t "security"

# Full test suite
pnpm test src/commands/instances/
```

---

**Found by:** Claude Sonnet 4.5 during comprehensive test suite development
**Date:** 2026-02-15
**Status:** Awaiting review and implementation
