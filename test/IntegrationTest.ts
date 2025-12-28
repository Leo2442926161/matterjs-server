/**
 * Integration test for the Matter.js server.
 *
 * This test starts the actual server and a test device, then validates
 * the full commissioning and control flow via WebSocket.
 */

import { expect } from "chai";
import { ChildProcess } from "child_process";
import {
    cleanupTempStorage,
    createTempStoragePaths,
    killProcess,
    MANUAL_PAIRING_CODE,
    MatterWebSocketClient,
    SERVER_PORT,
    SERVER_WS_URL,
    startServer,
    startTestDevice,
    waitForDeviceReady,
    waitForPort,
} from "./helpers/index.js";

const TEST_TIMEOUT = 120_000; // 2 minutes for Matter commissioning

/**
 * Helper to wait for OnOff attribute update event.
 */
async function waitForOnOffUpdate(
    client: MatterWebSocketClient,
    nodeId: number,
    expectedValue: boolean,
): Promise<void> {
    const event = await client.waitForEvent(
        "attribute_updated",
        data => {
            const [eventNodeId, path] = data as [number, string, unknown];
            return eventNodeId === nodeId && path === "1/6/0";
        },
        10_000,
    );
    const [, , value] = event.data as [number, string, boolean];
    expect(value).to.equal(expectedValue);
}

describe("Integration Test", function () {
    this.timeout(TEST_TIMEOUT);

    let serverProcess: ChildProcess;
    let deviceProcess: ChildProcess;
    let client: MatterWebSocketClient;
    let serverStoragePath: string;
    let deviceStoragePath: string;
    let commissionedNodeId: number;

    before(async function () {
        // Create temp directories
        const paths = await createTempStoragePaths();
        serverStoragePath = paths.serverStoragePath;
        deviceStoragePath = paths.deviceStoragePath;

        console.log(`Server storage: ${serverStoragePath}`);
        console.log(`Device storage: ${deviceStoragePath}`);

        // Start server process
        console.log("Starting server...");
        serverProcess = startServer(serverStoragePath);

        // Wait for server to be ready
        await waitForPort(SERVER_PORT);
        console.log("Server is ready");

        // Connect WebSocket client
        client = new MatterWebSocketClient(SERVER_WS_URL);
        const serverInfo = await client.connect();
        console.log("Connected to server, schema version:", serverInfo.schema_version);
    });

    after(async function () {
        // Close WebSocket client
        if (client) {
            await client.close();
        }

        // Kill processes
        await killProcess(deviceProcess);
        await killProcess(serverProcess);

        // Cleanup temp directories
        await cleanupTempStorage(serverStoragePath, deviceStoragePath);
    });

    it("should have no commissioned nodes initially", async function () {
        const nodes = await client.startListening();
        expect(nodes).to.be.an("array").that.is.empty;
    });

    it("should start device and commission it", async function () {
        // Start device process
        console.log("Starting test device...");
        deviceProcess = startTestDevice(deviceStoragePath);

        // Wait for device to be ready
        await waitForDeviceReady(deviceProcess);
        console.log("Device is ready, commissioning...");

        // Give mDNS time to propagate
        await new Promise(r => setTimeout(r, 3000));

        // Commission using manual pairing code
        const node = await client.commissionWithCode(MANUAL_PAIRING_CODE);
        commissionedNodeId = Number(node.node_id);

        console.log("Node commissioned:", commissionedNodeId);
        console.log("Node attributes:", Object.keys(node.attributes));

        // Verify node ID is 2 (first commissioned node - controller uses node ID 1)
        expect(commissionedNodeId).to.equal(2);

        // Verify node metadata
        expect(node.available).to.be.true;
        expect(node.is_bridge).to.be.false;

        // Verify Basic Information cluster (endpoint 0, cluster 40)
        expect(node.attributes["0/40/0"]).to.exist; // DataModelRevision
        expect(node.attributes["0/40/1"]).to.equal("Test Vendor"); // VendorName
        expect(node.attributes["0/40/3"]).to.equal("Test Light"); // ProductName

        // Verify Descriptor cluster (endpoint 0, cluster 29)
        expect(node.attributes["0/29/0"]).to.be.an("array"); // DeviceTypeList

        // Verify OnOff cluster on endpoint 1 (cluster 6)
        expect(node.attributes["1/6/0"]).to.equal(false); // OnOff initially off

        // Verify OnOff device type on endpoint 1 (device type 256 = 0x100 = OnOffLight)
        const deviceTypes = node.attributes["1/29/0"] as Array<Record<string, unknown>>;
        expect(deviceTypes).to.be.an("array");
        expect(deviceTypes.some(dt => dt["0"] === 256)).to.be.true;
    });

    it("should toggle light and receive attribute update", async function () {
        // Toggle ON
        client.clearEvents();
        await client.deviceCommand(commissionedNodeId, 1, 6, "toggle", {});
        await waitForOnOffUpdate(client, commissionedNodeId, true);

        // Toggle OFF
        client.clearEvents();
        await client.deviceCommand(commissionedNodeId, 1, 6, "toggle", {});
        await waitForOnOffUpdate(client, commissionedNodeId, false);
    });

    it("should persist node after server restart and still work", async function () {
        // Close current client connection
        await client.close();

        // Stop the server
        console.log("Stopping server for restart test...");
        await killProcess(serverProcess);

        // Wait a moment for cleanup
        await new Promise(r => setTimeout(r, 2000));

        // Restart the server with the same storage path
        console.log("Restarting server...");
        serverProcess = startServer(serverStoragePath);
        await waitForPort(SERVER_PORT);
        console.log("Server restarted");

        // Reconnect WebSocket client
        client = new MatterWebSocketClient(SERVER_WS_URL);
        const serverInfo = await client.connect();
        console.log("Reconnected to server, schema version:", serverInfo.schema_version);

        // Verify the node is still there
        const nodes = await client.startListening();
        expect(nodes).to.be.an("array").with.lengthOf(1);

        const node = nodes[0];
        expect(Number(node.node_id)).to.equal(commissionedNodeId);
        expect(node.available).to.be.true;

        // Verify node attributes are preserved
        expect(node.attributes["0/40/1"]).to.equal("Test Vendor");
        expect(node.attributes["0/40/3"]).to.equal("Test Light");

        // Wait for device to reconnect to the restarted server
        await new Promise(r => setTimeout(r, 3000));

        // Toggle ON and verify events still work
        client.clearEvents();
        await client.deviceCommand(commissionedNodeId, 1, 6, "toggle", {});
        await waitForOnOffUpdate(client, commissionedNodeId, true);

        // Toggle OFF
        client.clearEvents();
        await client.deviceCommand(commissionedNodeId, 1, 6, "toggle", {});
        await waitForOnOffUpdate(client, commissionedNodeId, false);

        console.log("Server restart test passed - node persisted and functional");
    });

    it("should decommission node", async function () {
        client.clearEvents();

        await client.removeNode(commissionedNodeId);

        // Wait for node_removed event (compare with Number() to handle bigint)
        const removeEvent = await client.waitForEvent(
            "node_removed",
            data => Number(data) === commissionedNodeId,
            10_000,
        );
        expect(removeEvent).to.exist;
        expect(Number(removeEvent.data)).to.equal(commissionedNodeId);

        // Verify no nodes remain
        const nodes = await client.startListening();
        expect(nodes).to.be.an("array").that.is.empty;
    });
});
