# Integration Test Design

## Overview

Add an integration test that starts the actual Matter server and a test device, then validates the full commissioning and control flow via WebSocket.

## Files to Create

### 1. `test/IntegrationTest.ts`

Main integration test file at the repository root level.

### 2. `test/fixtures/TestLightDevice.ts`

Minimal Matter OnOffLight device for testing.

## Test Structure

```typescript
describe("Integration Test", function () {
  this.timeout(120_000);

  let serverProcess: ChildProcess;
  let deviceProcess: ChildProcess;
  let client: MatterWebSocketClient;
  let serverStoragePath: string;
  let deviceStoragePath: string;
  let commissionedNodeId: number;

  before(async () => { /* setup */ });
  after(async () => { /* cleanup */ });

  it("should have no commissioned nodes initially");
  it("should start device and commission it");
  it("should toggle light and receive attribute update");
  it("should decommission node");
});
```

## WebSocket Client Helper

```typescript
class MatterWebSocketClient {
  private ws: WebSocket;
  private messageId = 0;
  private pendingRequests: Map<string, {resolve, reject}>;
  private serverInfo: ServerInfoMessage | null = null;
  private events: Array<{event: string, data: unknown}> = [];

  async connect(): Promise<ServerInfoMessage>
  async sendCommand<T>(command: string, args?: object): Promise<T>
  async startListening(): Promise<MatterNode[]>
  async commissionWithCode(code: string): Promise<MatterNode>
  async deviceCommand(nodeId, endpointId, clusterId, commandName, payload): Promise<unknown>
  async removeNode(nodeId: number): Promise<void>

  // Event handling
  clearEvents(): void
  getEvents(): Array<{event: string, data: unknown}>
  async waitForEvent(
    eventType: string,
    matcher?: (data: unknown) => boolean,
    timeoutMs?: number
  ): Promise<{event: string, data: unknown}>

  async close(): Promise<void>
}
```

## Test Device Fixture

```typescript
import { ServerNode, Environment } from "@matter/main";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";

// Parse CLI args for storage path
const args = process.argv.slice(2);
const storagePathArg = args.find(a => a.startsWith("--storage-path="));
const storagePath = storagePathArg?.split("=")[1] ?? ".device-storage";

// Configure environment
const env = Environment.default;
env.vars.set("storage.path", storagePath);

// Create device with fixed pairing codes
const node = await ServerNode.create({
  id: "test-light",
  network: { port: 5540 },
  commissioning: {
    passcode: 20202021,
    discriminator: 3840,
  },
  productDescription: {
    name: "Test Light",
    deviceType: OnOffLightDevice.deviceType,
  },
});

await node.add(OnOffLightDevice);
await node.run();

process.on("SIGTERM", () => node.close());
process.on("SIGINT", () => node.close());
```

## Test Flow Details

### 1. Setup (before hook)

- Create two separate temp directories:
  - `serverStoragePath = join(tmpdir(), 'matter-test-server-{timestamp}')`
  - `deviceStoragePath = join(tmpdir(), 'matter-test-device-{timestamp}')`
- Start server process: `node packages/matter-server/dist/esm/MatterServer.js --storage-path=<serverStoragePath>`
- Wait for server to be ready (port 5580 listening)
- Connect WebSocket client to `ws://localhost:5580/ws`

### 2. Test: No commissioned nodes initially

```typescript
const nodes = await client.startListening();
expect(nodes).to.be.an("array").that.is.empty;
```

### 3. Test: Commission device

- Start device process: `npx tsx test/fixtures/TestLightDevice.ts --storage-path=<deviceStoragePath>`
- Wait for device to be discoverable
- Commission using manual pairing code `34970112332`
- Validate:
  - `node_id === 1`
  - `available === true`
  - `is_bridge === false`
  - Basic Information cluster attributes (0/40/*)
  - Descriptor cluster (0/29/0 device type list)
  - OnOff cluster (1/6/0 initially false)
  - Device type 256 (OnOffLight) on endpoint 1

### 4. Test: Toggle light

- Clear events
- Send toggle command to endpoint 1, cluster 6
- Wait for `attribute_updated` event with path `1/6/0`
- Verify value is `true`
- Toggle again
- Wait for event, verify value is `false`

### 5. Test: Decommission

- Clear events
- Call `removeNode(1)`
- Wait for `node_removed` event with data `1`
- Call `startListening()` and verify empty array

### 6. Cleanup (after hook)

- Close WebSocket client
- Kill device process (SIGTERM)
- Kill server process (SIGTERM)
- Remove temp directories recursively

## Constants

```typescript
const SERVER_PORT = 5580;
const SERVER_WS_URL = `ws://localhost:${SERVER_PORT}/ws`;
const DEVICE_PORT = 5540;
const DEVICE_PASSCODE = 20202021;
const DEVICE_DISCRIMINATOR = 3840;
const MANUAL_PAIRING_CODE = "34970112332";
```

## Dependencies

Uses existing dev dependencies:
- `ws` - WebSocket client
- `chai` - assertions
- `mocha` - test framework (via @matter/testing)

Node built-ins:
- `child_process` - spawn processes
- `fs/promises` - temp directory management
- `os` - tmpdir()
- `path` - path joining
