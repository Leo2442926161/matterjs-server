import type { Bytes } from "@matter/general";
import { StandardCrypto } from "@matter/main";
import { Icac, Noc, Rcac } from "@matter/protocol";
import { readFile, writeFile } from "node:fs/promises";
import {
    TlvFabricIndexList,
    TlvFabricMetadata,
    TlvGroupKeySet,
    TlvLastKnownGoodTime,
    TlvSessionResumptionDetails,
    TlvSessionResumptionEntry,
    TlvSessionResumptionIndex,
} from "./TlvSchemas.js";
import type { ChipConfigFile, DecodedEntry, FabricData, GlobalData, SessionData } from "./types.js";

/** Result of certificate chain verification */
export interface CertificateVerificationResult {
    valid: boolean;
    rcacValid?: boolean;
    icacValid?: boolean;
    nocValid?: boolean;
    error?: string;
}

/**
 * Fabric configuration data extracted from chip.json.
 * This is a partial representation of Fabric.SyncConfig from @matter/protocol.
 *
 * IMPORTANT: The controller's operational keypair is NOT available in chip.json.
 *
 * The Python CHIP SDK intentionally does not persist the operational private key to chip.json.
 * When pychip_OpCreds_AllocateController is called without a keypair parameter, it generates
 * an ephemeral P256 keypair, creates a NOC for it, but only stores the keypair in memory
 * (see FabricTable.cpp:190 - "Operational Key is never saved to storage here").
 *
 * This means when migrating from Python Matter Server to matter.js:
 * - The RCAC and ICAC can be reused (they define the fabric's CA chain)
 * - The NOC must be REPLACED with a new one signed for a new keypair
 * - A new operational keypair must be generated for the matter.js controller
 * - The IPK and other fabric data can be preserved
 *
 * The ExampleOpCredsCAKey1/ICAKey1 in chip.json are the CA/ICA signing keys (for issuing
 * certificates to devices), NOT the controller's operational identity key.
 *
 * Fields that need to be computed or provided when creating the Fabric:
 * - keyPair: Must generate a new keypair and issue a new NOC
 * - globalId: Computed from fabricId + rootPublicKey
 * - operationalIdentityProtectionKey: Computed from identityProtectionKey + globalId
 */
export interface FabricConfigData {
    /** Fabric index (1, 2, etc.) */
    fabricIndex: number;
    /** Fabric ID from NOC certificate (can be number for small values, bigint for large) */
    fabricId: number | bigint;
    /** Node ID from NOC certificate (can be number for small values, bigint for large) */
    nodeId: number | bigint;
    /** Root node ID from RCAC certificate (can be number for small values, bigint for large) */
    rootNodeId: number | bigint;
    /** Root vendor ID from fabric metadata */
    rootVendorId: number;
    /** Root CA certificate (RCAC) as TLV bytes */
    rootCert: Bytes;
    /** Root CA public key extracted from RCAC */
    rootPublicKey: Bytes;
    /** Identity Protection Key from group key set 0 */
    identityProtectionKey: Bytes;
    /** Intermediate CA certificate (ICAC) as TLV bytes, if present */
    intermediateCACert?: Bytes;
    /** Node Operational Certificate (NOC) as TLV bytes */
    operationalCert: Bytes;
    /** Fabric label */
    label: string;
}

/**
 * Manages chip.json configuration data with categorized access to fabrics,
 * sessions, globals, and generic entries.
 *
 * Decodes base64 TLV data for access while preserving original encoding
 * for round-trip serialization.
 */
export class ChipConfigData {
    /** Fabric-specific data keyed by fabric index */
    readonly fabrics = new Map<number, FabricData>();

    /** Global session resumption index */
    readonly sessions: SessionData = {};

    /** Global configuration data */
    readonly globals: GlobalData = {};

    /** Ignored keys (failsafe markers, counters, ICD) - stored as original base64 */
    readonly ignored = new Map<string, string>();

    /** Generic/unknown keys - stored as original base64 */
    readonly generic = new Map<string, string>();

    /** The repl-config section preserved as-is */
    replConfig: Record<string, unknown> = {};

    /** Keys that should be ignored (stored but not parsed) */
    private static readonly IGNORED_KEY_PATTERNS = [
        /^g\/fs\/[cn]$/, // Failsafe markers: g/fs/c, g/fs/n
        /^g\/gdc$/, // Global group counter (not TLV)
        /^g\/gcc$/, // Global group counter (not TLV)
        /^g\/gfl$/, // Group to endpoint mapping
        /^g\/icdfl$/, // ICD stuff
    ];

    /**
     * Decode a base64 string to a DecodedEntry with both raw bytes and original base64.
     */
    private static decodeEntry(base64: string): DecodedEntry {
        const buffer = Buffer.from(base64, "base64");
        return {
            raw: new Uint8Array(buffer),
            base64,
        };
    }

    /**
     * Check if a key should be ignored (stored but not parsed).
     */
    private static isIgnoredKey(key: string): boolean {
        return this.IGNORED_KEY_PATTERNS.some(pattern => pattern.test(key));
    }

    /**
     * Get or create a FabricData entry for the given fabric index.
     */
    private getOrCreateFabric(index: number): FabricData {
        let fabric = this.fabrics.get(index);
        if (!fabric) {
            fabric = {
                index,
                keys: new Map(),
                keysDecoded: new Map(),
                sessions: new Map(),
                sessionsDecoded: new Map(),
                resumptions: new Map(),
                resumptionsDecoded: new Map(),
                other: new Map(),
            };
            this.fabrics.set(index, fabric);
        }
        return fabric;
    }

    /**
     * Parse a fabric-specific key and store the data.
     * Format: f/<fabricIndex>/<subkey>[/<subsubkey>]
     */
    private parseFabricKey(key: string, value: string): void {
        const match = key.match(/^f\/([0-9a-fA-F]+)\/(.+)$/);
        if (!match) return;

        const fabricIndex = parseInt(match[1], 16);
        const subKey = match[2];
        const fabric = this.getOrCreateFabric(fabricIndex);
        const entry = ChipConfigData.decodeEntry(value);

        if (subKey === "n") {
            fabric.noc = entry;
        } else if (subKey === "i") {
            fabric.icac = entry;
        } else if (subKey === "r") {
            fabric.rcac = entry;
        } else if (subKey === "m") {
            fabric.metadata = entry;
            // Decode the TLV metadata structure
            try {
                fabric.metadataDecoded = TlvFabricMetadata.decode(entry.raw);
            } catch {
                // Keep metadataDecoded undefined if decoding fails
            }
        } else if (subKey.startsWith("k/")) {
            const keyIndex = parseInt(subKey.slice(2), 10);
            fabric.keys.set(keyIndex, entry);
            // Decode the TLV group key set structure
            try {
                fabric.keysDecoded.set(keyIndex, TlvGroupKeySet.decode(entry.raw));
            } catch {
                // Keep decoded undefined if decoding fails
            }
        } else if (subKey.startsWith("s/")) {
            const nodeHex = subKey.slice(2);
            fabric.sessions.set(nodeHex, entry);
            // Decode the TLV session resumption details structure
            try {
                fabric.sessionsDecoded.set(nodeHex, TlvSessionResumptionDetails.decode(entry.raw));
            } catch {
                // Keep decoded undefined if decoding fails
            }
        } else {
            fabric.other.set(subKey, entry);
        }
    }

    /**
     * Parse a global key and store the data.
     */
    private parseGlobalKey(key: string, value: string): void {
        const entry = ChipConfigData.decodeEntry(value);

        if (key === "g/fidx") {
            this.globals.fabricIndexList = entry;
            // Decode the TLV fabric index list structure
            try {
                this.globals.fabricIndexListDecoded = TlvFabricIndexList.decode(entry.raw);
            } catch {
                // Keep decoded undefined if decoding fails
            }
        } else if (key === "g/lkgt") {
            this.globals.lastKnownGoodTime = entry;
            // Decode the TLV last known good time structure
            try {
                this.globals.lastKnownGoodTimeDecoded = TlvLastKnownGoodTime.decode(entry.raw);
            } catch {
                // Keep decoded undefined if decoding fails
            }
        } else if (key === "g/sri") {
            this.sessions.resumptionIndex = entry;
            // Decode the TLV session resumption index array
            try {
                this.sessions.resumptionIndexDecoded = TlvSessionResumptionIndex.decode(entry.raw);
            } catch {
                // Keep decoded undefined if decoding fails
            }
        } else if (key.startsWith("g/s/")) {
            // Session resumption entries (g/s/<resumptionId>) are stored in the fabric they belong to
            const resumptionId = key.slice(4);
            try {
                const decoded = TlvSessionResumptionEntry.decode(entry.raw);
                const fabric = this.getOrCreateFabric(decoded.fabricIndex);
                fabric.resumptions.set(resumptionId, entry);
                fabric.resumptionsDecoded.set(resumptionId, decoded);
            } catch {
                // If decoding fails, we can't determine the fabric - store in generic
                this.generic.set(key, value);
            }
        }
    }

    /**
     * Load and parse a chip.json file.
     */
    async load(filePath: string): Promise<void> {
        const content = await readFile(filePath, "utf-8");
        const data: ChipConfigFile = JSON.parse(content);

        // Clear existing data
        this.fabrics.clear();
        this.sessions.resumptionIndex = undefined;
        this.sessions.resumptionIndexDecoded = undefined;
        this.globals.fabricIndexList = undefined;
        this.globals.fabricIndexListDecoded = undefined;
        this.globals.lastKnownGoodTime = undefined;
        this.globals.lastKnownGoodTimeDecoded = undefined;
        this.ignored.clear();
        this.generic.clear();

        // Store repl-config as-is
        this.replConfig = data["repl-config"] ?? {};

        // Parse sdk-config entries
        const sdkConfig = data["sdk-config"] ?? {};
        for (const [key, value] of Object.entries(sdkConfig)) {
            if (ChipConfigData.isIgnoredKey(key)) {
                this.ignored.set(key, value);
            } else if (key.startsWith("f/")) {
                this.parseFabricKey(key, value);
            } else if (key.startsWith("g/")) {
                this.parseGlobalKey(key, value);
            } else {
                // Generic/unknown key - store as-is
                this.generic.set(key, value);
            }
        }
    }

    /**
     * Serialize and save the data back to a chip.json file.
     */
    async save(filePath: string): Promise<void> {
        const sdkConfig: Record<string, string> = {};

        // Add global data
        if (this.globals.fabricIndexList) {
            sdkConfig["g/fidx"] = this.globals.fabricIndexList.base64;
        }
        if (this.globals.lastKnownGoodTime) {
            sdkConfig["g/lkgt"] = this.globals.lastKnownGoodTime.base64;
        }

        // Add session resumption index
        if (this.sessions.resumptionIndex) {
            sdkConfig["g/sri"] = this.sessions.resumptionIndex.base64;
        }

        // Add fabric data
        for (const [fabricIndex, fabric] of this.fabrics) {
            const prefix = `f/${fabricIndex}`;

            if (fabric.noc) {
                sdkConfig[`${prefix}/n`] = fabric.noc.base64;
            }
            if (fabric.icac) {
                sdkConfig[`${prefix}/i`] = fabric.icac.base64;
            }
            if (fabric.rcac) {
                sdkConfig[`${prefix}/r`] = fabric.rcac.base64;
            }
            if (fabric.metadata) {
                sdkConfig[`${prefix}/m`] = fabric.metadata.base64;
            }

            for (const [keyIndex, entry] of fabric.keys) {
                sdkConfig[`${prefix}/k/${keyIndex}`] = entry.base64;
            }

            for (const [nodeHex, entry] of fabric.sessions) {
                sdkConfig[`${prefix}/s/${nodeHex}`] = entry.base64;
            }

            // Add global session resumption entries for this fabric (g/s/<resumptionId>)
            for (const [resumptionId, entry] of fabric.resumptions) {
                sdkConfig[`g/s/${resumptionId}`] = entry.base64;
            }

            for (const [subKey, entry] of fabric.other) {
                sdkConfig[`${prefix}/${subKey}`] = entry.base64;
            }
        }

        // Add ignored keys
        for (const [key, value] of this.ignored) {
            sdkConfig[key] = value;
        }

        // Add generic keys
        for (const [key, value] of this.generic) {
            sdkConfig[key] = value;
        }

        const output: ChipConfigFile = {
            "sdk-config": sdkConfig,
        };

        if (Object.keys(this.replConfig).length > 0) {
            output["repl-config"] = this.replConfig;
        }

        await writeFile(filePath, JSON.stringify(output, null, 4), "utf-8");
    }

    /**
     * Get a list of all fabric indices.
     */
    getFabricIndices(): number[] {
        return Array.from(this.fabrics.keys()).sort((a, b) => a - b);
    }

    /**
     * Get fabric data by index.
     */
    getFabric(index: number): FabricData | undefined {
        return this.fabrics.get(index);
    }

    /**
     * Decode the RCAC (Root CA Certificate) for a fabric.
     * Returns undefined if the fabric or RCAC doesn't exist.
     */
    getRcac(fabricIndex: number): Rcac | undefined {
        const fabric = this.fabrics.get(fabricIndex);
        if (!fabric?.rcac) return undefined;
        try {
            return Rcac.fromTlv(fabric.rcac.raw);
        } catch {
            return undefined;
        }
    }

    /**
     * Decode the ICAC (Intermediate CA Certificate) for a fabric.
     * Returns undefined if the fabric or ICAC doesn't exist.
     * Note: ICAC is optional - some fabrics may not have an intermediate certificate.
     */
    getIcac(fabricIndex: number): Icac | undefined {
        const fabric = this.fabrics.get(fabricIndex);
        if (!fabric?.icac) return undefined;
        try {
            return Icac.fromTlv(fabric.icac.raw);
        } catch {
            return undefined;
        }
    }

    /**
     * Decode the NOC (Node Operational Certificate) for a fabric.
     * Returns undefined if the fabric or NOC doesn't exist.
     */
    getNoc(fabricIndex: number): Noc | undefined {
        const fabric = this.fabrics.get(fabricIndex);
        if (!fabric?.noc) return undefined;
        try {
            return Noc.fromTlv(fabric.noc.raw);
        } catch {
            return undefined;
        }
    }

    /**
     * Verify the certificate chain for a fabric.
     * Validates RCAC (self-signed), ICAC (if present, against RCAC), and NOC (against chain).
     */
    async verifyCertificateChain(fabricIndex: number): Promise<CertificateVerificationResult> {
        const crypto = new StandardCrypto();
        const result: CertificateVerificationResult = { valid: false };

        // Get certificates
        const rcac = this.getRcac(fabricIndex);
        if (!rcac) {
            return { ...result, error: "RCAC not found or invalid" };
        }

        const icac = this.getIcac(fabricIndex);
        const noc = this.getNoc(fabricIndex);
        if (!noc) {
            return { ...result, error: "NOC not found or invalid" };
        }

        // Verify RCAC (self-signed)
        try {
            await rcac.verify(crypto);
            result.rcacValid = true;
        } catch (e) {
            result.rcacValid = false;
            return { ...result, error: `RCAC verification failed: ${e instanceof Error ? e.message : String(e)}` };
        }

        // Verify ICAC (if present)
        if (icac) {
            try {
                await icac.verify(crypto, rcac);
                result.icacValid = true;
            } catch (e) {
                result.icacValid = false;
                return { ...result, error: `ICAC verification failed: ${e instanceof Error ? e.message : String(e)}` };
            }
        }

        // Verify NOC
        try {
            await noc.verify(crypto, rcac, icac);
            result.nocValid = true;
        } catch (e) {
            result.nocValid = false;
            return { ...result, error: `NOC verification failed: ${e instanceof Error ? e.message : String(e)}` };
        }

        result.valid = true;
        return result;
    }

    /**
     * Extract fabric configuration data in a format similar to Fabric.SyncConfig.
     *
     * This extracts all available data from chip.json for creating a matter.js Fabric.
     *
     * IMPORTANT: The returned data does NOT include the operational keypair because
     * the Python CHIP SDK does not persist it to chip.json (it generates an ephemeral
     * keypair on each run). To use this fabric data with matter.js:
     *
     * 1. Generate a new P256 keypair for the controller
     * 2. Use the CA keys (ExampleOpCredsICAKey1 or ExampleOpCredsCAKey1 from generic storage)
     *    to sign a new NOC for the new keypair
     * 3. The RCAC, ICAC, IPK, vendorId, fabricId, and label can all be preserved
     *
     * The identityProtectionKey is extracted from group key set 0 (IPK).
     *
     * @param fabricIndex The fabric index to extract
     * @returns FabricConfigData or undefined if fabric doesn't exist or data is incomplete
     */
    getFabricConfig(fabricIndex: number): FabricConfigData | undefined {
        const fabric = this.fabrics.get(fabricIndex);
        if (!fabric) return undefined;

        // Get decoded certificates
        const rcac = this.getRcac(fabricIndex);
        const noc = this.getNoc(fabricIndex);

        if (!rcac || !noc) return undefined;
        if (!fabric.rcac || !fabric.noc) return undefined;

        // Extract NOC subject data
        const { nodeId, fabricId } = noc.cert.subject;
        if (nodeId === undefined || fabricId === undefined) return undefined;

        // Extract RCAC subject data (rcacId is used as rootNodeId)
        const { rcacId } = rcac.cert.subject;
        if (rcacId === undefined) return undefined;

        // Get vendor ID and label from metadata
        if (!fabric.metadataDecoded) return undefined;
        const { vendorId, label } = fabric.metadataDecoded;

        // Get IPK from group key set 0
        const ipkKeySet = fabric.keysDecoded.get(0);
        if (!ipkKeySet || ipkKeySet.keys.length === 0) return undefined;

        // The first key entry contains the actual IPK
        const ipkEntry = ipkKeySet.keys.find(k => k.key.byteLength === 16);
        if (!ipkEntry) return undefined;

        return {
            fabricIndex,
            fabricId,
            nodeId,
            rootNodeId: rcacId,
            rootVendorId: vendorId,
            rootCert: fabric.rcac.raw,
            rootPublicKey: rcac.cert.ellipticCurvePublicKey,
            identityProtectionKey: ipkEntry.key,
            intermediateCACert: fabric.icac?.raw,
            operationalCert: fabric.noc.raw,
            label,
        };
    }
}
