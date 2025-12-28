# WebSocket API Comparison: Python Matter Server vs Matter.js Server

This document compares the WebSocket API functionality between the original Python Matter Server and this Matter.js-based implementation.

## Summary

| Category | Python Server | Matter.js Server | Coverage |
|----------|--------------|------------------|----------|
| Commands | 26 | 25 implemented | ~96% |
| Events | 9 | 9 | 100% |
| Full functionality | - | - | ~99% |

---

## Command Comparison

### Legend
- ✅ Fully implemented
- ⚠️ Partially implemented / stubbed
- ❌ Not implemented

### Commissioning Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `commission_with_code` | ✅ | ✅ | Both support QR and manual pairing codes |
| `commission_on_network` | ✅ | ✅ | Commission via setup PIN with optional filters |
| `open_commissioning_window` | ✅ | ✅ | Open window for multi-fabric commissioning |
| `discover` | ✅ | ✅ | As `discover_commissionable_nodes` |

### Network Credential Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `set_wifi_credentials` | ✅ | ✅ | Store WiFi for BLE commissioning |
| `set_thread_dataset` | ✅ | ✅ | Store Thread dataset for commissioning |

### Node Management Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `start_listening` | ✅ | ✅ | Enable events + get all nodes |
| `get_nodes` | ✅ | ✅ | Get all commissioned nodes |
| `get_node` | ✅ | ✅ | Get single node by ID |
| `interview_node` | ✅ | ✅ | Emits node_updated event (nodes stay fresh via subscriptions) |
| `remove_node` | ✅ | ✅ | Decommission and remove node |
| `ping_node` | ✅ | ⚠️ | Stubbed - returns cached IPs with true |
| `get_node_ip_addresses` | ✅ | ✅ | Get node's current IP addresses |
| `set_default_fabric_label` | ✅ | ✅ | Set fabric label for new nodes |

### Device Control Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `device_command` | ✅ | ✅ | Invoke cluster commands |
| `read_attribute` | ✅ | ✅ | Read device attributes |
| `write_attribute` | ✅ | ✅ | Write device attributes |

### Access Control & Binding Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `set_acl_entry` | ✅ | ✅ | Set access control list entries |
| `set_node_binding` | ✅ | ✅ | Set node bindings for device communication |

### Server Information Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `server_info` | ✅ | ⚠️ | Sent on connect, no separate command |
| `diagnostics` | ✅ | ✅ | Full server diagnostics dump |
| `get_vendor_names` | ✅ | ✅ | Vendor ID to name mapping |

### Fabric Management Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `get_matter_fabrics` | ❌ | ✅ | Get fabrics connected to device |
| `remove_matter_fabric` | ❌ | ✅ | Remove specific fabric from device |

### OTA Update Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `check_node_update` | ✅ | ✅ | Queries DCL for updates, caches results from events |
| `update_node` | ✅ | ✅ | Triggers OTA update via SoftwareUpdateManager |

### Testing/Debug Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `import_test_node` | ✅ | ❌ | Import test nodes from diagnostics |

---

## Event Comparison

| Event | Python | Matter.js | Notes |
|-------|--------|-----------|-------|
| `node_added` | ✅ | ✅ | New node commissioned |
| `node_updated` | ✅ | ✅ | Node data/state changed |
| `node_removed` | ✅ | ✅ | Node decommissioned |
| `node_event` | ✅ | ✅ | Cluster events (e.g., button press) |
| `attribute_updated` | ✅ | ✅ | Attribute value changed |
| `server_shutdown` | ✅ | ✅ | Server shutting down notification |
| `server_info_updated` | ✅ | ✅ | Server info changed (WiFi/Thread credentials) |
| `endpoint_added` | ✅ | ✅ | Bridge endpoint added |
| `endpoint_removed` | ✅ | ✅ | Bridge endpoint removed |

---

## Missing Functionality - Detailed

### ~~1. `commission_on_network`~~ ✅ IMPLEMENTED

This command has been implemented. See `WebSocketControllerHandler.#handleCommissionOnNetwork()`.

Supports:
- `setup_pin_code` - Required passcode
- `filter_type` - 0=None, 1=ShortDiscriminator, 2=LongDiscriminator, 3=VendorId
- `filter` - Filter value based on type
- `ip_addr` - Direct IP address for commissioning

> **Note:** `set_acl_entry` and `set_node_binding` have also been implemented.

---

### ~~1. `get_node`~~ ✅ IMPLEMENTED

This command has been implemented. See `WebSocketControllerHandler.#handleGetNode()`.

Returns a single `MatterNode` by ID - same structure as `get_nodes`.

---

### ~~2. `interview_node`~~ ✅ IMPLEMENTED

This command has been implemented. See `WebSocketControllerHandler.#handleInterviewNode()`.

Since Matter.js nodes are kept up-to-date via attribute subscriptions, we don't need
to re-read all attributes. The implementation emits a `node_updated` event with the
current (already fresh) data, matching Python server behavior.

---

### 1. `ping_node` - Full Implementation (Priority: Low)

**Purpose:** Actually ping a node's IP addresses to verify network connectivity.

**Current State:** Stubbed - returns cached IPs with `true` status without actual ping.

**Python Implementation:**
```python
async def ping_node(
    self,
    node_id: int,
    attempts: int = 1
) -> dict[str, bool]  # {ip_address: reachable}
```

**Use Cases:**
- Diagnose connectivity issues
- Verify node is reachable before commands
- Network troubleshooting

**Implementation Notes:**
- Use ICMP ping or Matter operational ping
- Support multiple attempts for reliability
- Return per-IP-address results

---

### ~~5. `set_acl_entry`~~ ✅ IMPLEMENTED

This command has been implemented. See `ControllerCommandHandler.setAclEntry()`.

---

### ~~6. `set_node_binding`~~ ✅ IMPLEMENTED

This command has been implemented. See `ControllerCommandHandler.setNodeBinding()`.

---

### ~~5. `node_event` Event~~ ✅ IMPLEMENTED

This event has been implemented. See `WebSocketControllerHandler.onEventChanged()`.

The implementation forwards Matter events to WebSocket clients with the following structure:
```typescript
{
    node_id: number | bigint,
    endpoint_id: number,
    cluster_id: number,
    event_id: number,
    event_number: number | bigint,
    priority: number,        // 0=Debug, 1=Info, 2=Critical
    timestamp: number | bigint,
    timestamp_type: number,  // 0=System, 1=Epoch, 2=POSIX
    data: unknown | null
}
```

---

### ~~5. `server_shutdown` Event~~ ✅ IMPLEMENTED

This event has been implemented. See `WebSocketControllerHandler.unregister()`.

Sends `server_shutdown` event to all connected clients before closing connections.

---

### ~~6. `server_info_updated` Event~~ ✅ IMPLEMENTED

This event has been implemented. See `WebSocketControllerHandler.#broadcastServerInfoUpdated()`.

Triggers when:
- WiFi credentials are set via `set_wifi_credentials`
- Thread dataset is set via `set_thread_dataset`

---

### ~~7. `endpoint_added` / `endpoint_removed` Events~~ ✅ IMPLEMENTED

These events have been implemented. See:
- `ControllerCommandHandler.events.nodeEndpointAdded`
- `ControllerCommandHandler.events.nodeEndpointRemoved`

Wired to PairedNode's `nodeEndpointAdded` and `nodeEndpointRemoved` events.

Data Format:
```typescript
{ node_id: number | bigint, endpoint_id: number }
```

---

### ~~8. OTA Update Support~~ ✅ IMPLEMENTED

Both OTA commands have been implemented. See `ControllerCommandHandler.checkNodeUpdate()` and `ControllerCommandHandler.updateNode()`.

**`check_node_update`:**
- First checks cached updates from `updateAvailable` events
- If not cached, queries the OTA provider's SoftwareUpdateManager
- Returns `MatterSoftwareVersion` if update available, `null` otherwise

**`update_node`:**
- Uses the OTA provider's `forceUpdate()` method
- Triggers the update via SoftwareUpdateManager
- Returns the update info on success

---

### 10. `import_test_node` (Priority: Low)

**Purpose:** Import mock/test nodes from a diagnostics dump for testing without physical devices.

**Python Implementation:**
```python
async def import_test_node(self, dump: str) -> None
```

**Use Cases:**
- Testing integrations without hardware
- Reproducing issues from user diagnostics
- Development and debugging

**Implementation Notes:**
- Parse JSON dump from `diagnostics` command
- Create mock node entries
- Node IDs >= 900000 reserved for test nodes

---

## Data Structure Differences

### ServerInfoMessage

| Field | Python | Matter.js | Notes |
|-------|--------|-----------|-------|
| `fabric_id` | ✅ | ✅ | |
| `compressed_fabric_id` | ✅ | ✅ | |
| `schema_version` | ✅ | ✅ | Both use version 11 |
| `min_supported_schema_version` | ✅ | ✅ | |
| `sdk_version` | ✅ | ✅ | CHIP SDK version string |
| `wifi_credentials_set` | ✅ | ✅ | |
| `thread_credentials_set` | ✅ | ✅ | |
| `bluetooth_enabled` | ✅ | ✅ | |

### MatterNode

Both implementations use compatible structures with attribute paths in `endpoint/cluster/attribute` format.

---

## Implementation Priority Recommendations

### High Priority (Required for Home Assistant parity)
All high-priority items have been implemented! ✅

### Medium Priority (Important features)
All medium-priority items have been implemented! ✅
- `endpoint_added`/`endpoint_removed` events - Bridge support ✅

### Low Priority (Nice to have)
1. `ping_node` - Full implementation (currently stubbed)
2. `import_test_node` - Testing support

---

## Compatibility Notes

1. **Schema Version:** Both use schema version 11, ensuring protocol compatibility
2. **Attribute Format:** Both use `endpoint/cluster/attribute` path format
3. **Data Encoding:** Both use tag-based numeric encoding for structs (e.g., `{"0": value}`)
4. **BigInt Handling:** Both handle node IDs as potentially large integers

The Matter.js server is designed to be a drop-in replacement for the Python Matter Server when used with Home Assistant's Matter integration.
