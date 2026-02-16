# Multi-Instance Manager - Migration Guide

## Changes in Latest Version

### 🔧 Port Spacing Increased (Breaking Change)

**What changed:**

- Port spacing increased from **10 to 120** ports
- Previous: 18800, 18810, 18820, ...
- New: 18800, 18920, 19040, ...

**Why:**
The previous 10-port spacing caused conflicts with Chrome DevTools Protocol (CDP) ports used by the browser tool. OpenClaw's browser automation requires:

- Gateway: base port
- Bridge: base + 1
- Browser control: base + 2
- CDP range: base + 11 to base + 110 (100 ports)

With 10-port spacing, Instance 2's bridge port (18811) conflicted with Instance 1's CDP range (18811-18910).

**Impact:**

- ✅ **New instances**: Automatically use 120-port spacing
- ⚠️ **Existing instances**: Continue working with old ports
- ⚠️ **Port conflicts**: If you have 2+ instances with old spacing, they may conflict

**Migration:**
If you have existing instances with port conflicts:

```bash
# Option 1: Destroy and recreate (loses config)
openclaw instances destroy old-instance --force
openclaw instances create old-instance

# Option 2: Keep existing instances as-is
# They will continue working with their allocated ports
# New instances will use the new spacing

# Option 3: Manually specify safe ports
openclaw instances create new-instance --port 19200
```

---

### 🔒 Security Improvements

#### 1. Default Binding Changed to Loopback

**What changed:**

- Previous: `OPENCLAW_GATEWAY_BIND=lan` (exposed to local network)
- New: `OPENCLAW_GATEWAY_BIND=loopback` (localhost only)

**Why:**
Better security by default. Gateway should only be accessible from the local machine unless explicitly configured otherwise.

**Impact:**

- ✅ **New instances**: Bind to localhost by default
- ✅ **Existing instances**: Continue using their configured binding
- ⚠️ **Remote access**: If you need LAN access, change to `lan` in `.env`

**Migration:**
To expose gateway to local network:

```bash
# Edit instance config
openclaw instances config myinstance

# Change this line:
# OPENCLAW_GATEWAY_BIND=loopback
# To:
# OPENCLAW_GATEWAY_BIND=lan

# Restart instance
openclaw instances stop myinstance
openclaw instances start myinstance
```

#### 2. .env File Permissions Restricted

**What changed:**

- New instances: `.env` created with `600` permissions (owner read/write only)
- Previous: `.env` created with default permissions (usually `644` - world readable)

**Why:**
`.env` files contain sensitive API keys and should not be readable by other users.

**Impact:**

- ✅ **New instances**: Protected automatically
- ⚠️ **Existing instances**: May have permissive permissions

**Migration:**
Secure existing instance .env files:

```bash
# Fix permissions for all instances
chmod 600 ~/.openclaw-multi/instances/*/.env

# Or for specific instance
chmod 600 ~/.openclaw-multi/instances/myinstance/.env
```

---

### ✨ New Features

#### 1. Port Availability Check

**What changed:**

- Instances now check if ports are available before allocation
- Clear error message if port is in use
- Custom ports validated before use

**Benefits:**

- ❌ Before: `docker compose up` failed with cryptic error
- ✅ After: Clear error: "Port 18800 is already in use"

**Example:**

```bash
$ openclaw instances create test --port 18800
Error: Port 18800 or 18801 is already in use

$ openclaw instances create test
# Automatically finds next available port
Instance 'test' created on port 18920
```

#### 2. Port Offset Reclamation

**What changed:**

- Destroying instances now reclaims their port offsets
- Offsets are reused for new instances (lowest first)
- Prevents port space waste

**Benefits:**

- ❌ Before: Destroy/create cycles wasted port space
- ✅ After: Ports are efficiently reused

**Example:**

```bash
# Before (old behavior):
openclaw instances create test1  # Port 18800
openclaw instances destroy test1 --force
openclaw instances create test2  # Port 18810 (wasted 18800!)

# After (new behavior):
openclaw instances create test1  # Port 18800
openclaw instances destroy test1 --force
openclaw instances create test2  # Port 18800 (reused!)
```

#### 3. Port Range Validation

**What changed:**

- Validates ports don't exceed 65535 (max valid port)
- Clear error message when port exhaustion occurs

**Benefits:**

- Prevents silent failures
- Helpful error messages

---

## Registry Format Changes

### New Fields

The `~/.openclaw-multi/registry.json` now includes:

```json
{
  "instances": {
    /* existing instances */
  },
  "nextPortOffset": 5,
  "availableOffsets": [0, 2] // New: reclaimed offsets
}
```

**Backward Compatibility:**

- Old registries work without changes
- `availableOffsets` is optional
- Will be created automatically when needed

---

## Testing Your Migration

### 1. Check Existing Instances

```bash
# List all instances
openclaw instances list

# Check for port conflicts
openclaw instances list | grep -E '(18810|18820|18830)'
# If you see instances here, they may have conflicts
```

### 2. Test Port Availability

```bash
# Try to create a new instance
openclaw instances create test-migration

# Should succeed with port 18920 or higher
openclaw instances list

# Cleanup
openclaw instances destroy test-migration --force
```

### 3. Verify Security Settings

```bash
# Check .env permissions
ls -la ~/.openclaw-multi/instances/*/. env

# Should show: -rw------- (600)
# If you see -rw-r--r-- (644), run:
chmod 600 ~/.openclaw-multi/instances/*/.env
```

### 4. Test Binding

```bash
# Start instance and check binding
openclaw instances start myinstance

# Test localhost access (should work)
curl http://127.0.0.1:18800/

# Test LAN access (should fail if loopback)
curl http://$(hostname -I | awk '{print $1}'):18800/
```

---

## Troubleshooting

### Problem: Port conflict errors

**Symptoms:**

```
Error: Port 18811 is already in use
```

**Solution:**

```bash
# Option 1: Use custom port with safe spacing
openclaw instances create myinstance --port 19200

# Option 2: Destroy conflicting instance
openclaw instances list
openclaw instances destroy conflicting-instance --force

# Option 3: Let auto-allocation find available port
openclaw instances create myinstance
# Will skip conflicted ports automatically
```

### Problem: Can't access gateway from other devices

**Symptoms:**

- Dashboard works on `localhost` but not from other machines

**Solution:**

```bash
# Change binding to LAN
openclaw instances config myinstance

# Edit .env:
OPENCLAW_GATEWAY_BIND=lan

# Restart
openclaw instances stop myinstance
openclaw instances start myinstance

# Test from other device
curl http://<your-ip>:18800/
```

### Problem: .env file not readable

**Symptoms:**

```
Permission denied: .env
```

**Solution:**

```bash
# Fix permissions
chmod 600 ~/.openclaw-multi/instances/myinstance/.env

# Verify
ls -la ~/.openclaw-multi/instances/myinstance/.env
# Should show: -rw-------
```

### Problem: Registry.json corruption

**Symptoms:**

```
Error: Unexpected token in JSON
```

**Solution:**

```bash
# Backup registry
cp ~/.openclaw-multi/registry.json ~/.openclaw-multi/registry.json.backup

# Manually fix or reset
# Option 1: Fix JSON syntax
vim ~/.openclaw-multi/registry.json

# Option 2: Reset (loses instance metadata)
rm ~/.openclaw-multi/registry.json
openclaw instances list  # Recreates empty registry
```

---

## Rollback Instructions

If you need to revert to old behavior:

### 1. Revert Port Spacing

Edit `src/commands/instances/instance-types.ts`:

```typescript
export const INSTANCES_PORT_STEP = 10; // Change back from 120
```

**Warning:** This will cause port conflicts if you use browser tools.

### 2. Revert Default Binding

Edit instance `.env` files:

```bash
OPENCLAW_GATEWAY_BIND=lan  # Change from loopback
```

### 3. Remove Port Availability Check

Not recommended - this removes a safety feature.

---

## FAQ

**Q: Will my existing instances break?**
A: No, existing instances keep their allocated ports and continue working.

**Q: Do I need to recreate all instances?**
A: No, only if you want to use the new 120-port spacing or security defaults.

**Q: Can I have both old and new instances?**
A: Yes, they coexist fine. Old instances use 10-port spacing, new ones use 120-port spacing.

**Q: What if I have more than 50 instances?**
A: With 120-port spacing, you can have ~389 instances (vs 4,673 with 10-port spacing). This is still more than enough for most use cases.

**Q: How do I check which instances are using which ports?**
A: Run `openclaw instances list` to see all ports.

**Q: Is the new port spacing required for all instances?**
A: Only if you use browser automation tools. If you don't use browser/CDP features, the old spacing works fine (but new instances will still use 120-port spacing).

---

## Upgrade Checklist

- [ ] Read this migration guide
- [ ] List existing instances: `openclaw instances list`
- [ ] Check for port conflicts (instances with close port numbers)
- [ ] Secure .env files: `chmod 600 ~/.openclaw-multi/instances/*/.env`
- [ ] Review instance bindings (loopback vs lan)
- [ ] Test creating new instance
- [ ] Verify existing instances still work
- [ ] Update any automation scripts (if using custom ports)

---

**Last Updated:** 2026-02-15
**Version:** 2026.2.15
