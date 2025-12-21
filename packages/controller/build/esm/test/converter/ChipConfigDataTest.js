import { Bytes } from "@matter/general";
import { expect } from "chai";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChipConfigData } from "../../src/converter/index.js";
describe("ChipConfigData", () => {
  let testDir;
  before(async () => {
    testDir = join(tmpdir(), `chip-config-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });
  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });
  describe("load", () => {
    it("should load and parse fabric certificates", async () => {
      const testFile = join(testDir, "fabric-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/n": "SGVsbG8gTk9D",
            // "Hello NOC" in base64
            "f/1/i": "SGVsbG8gSUNBQw==",
            // "Hello ICAC"
            "f/1/r": "SGVsbG8gUkNBQw==",
            // "Hello RCAC"
            "f/1/m": "TWV0YWRhdGE="
            // "Metadata"
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.fabrics.size).to.equal(1);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.index).to.equal(1);
      expect(fabric.noc).to.exist;
      expect(fabric.noc.base64).to.equal("SGVsbG8gTk9D");
      expect(Bytes.toString(fabric.noc.raw)).to.equal("Hello NOC");
      expect(fabric.icac).to.exist;
      expect(Bytes.toString(fabric.icac.raw)).to.equal("Hello ICAC");
      expect(fabric.rcac).to.exist;
      expect(Bytes.toString(fabric.rcac.raw)).to.equal("Hello RCAC");
      expect(fabric.metadata).to.exist;
      expect(Bytes.toString(fabric.metadata.raw)).to.equal("Metadata");
    });
    it("should load and parse fabric key sets", async () => {
      const testFile = join(testDir, "keys-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/k/0": "SVBL",
            // "IPK" - key set 0
            "f/1/k/1": "S2V5MQ=="
            // "Key1"
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.keys.size).to.equal(2);
      const ipk = fabric.keys.get(0);
      expect(ipk).to.exist;
      expect(Bytes.toString(ipk.raw)).to.equal("IPK");
      const key1 = fabric.keys.get(1);
      expect(key1).to.exist;
      expect(Bytes.toString(key1.raw)).to.equal("Key1");
    });
    it("should load and parse fabric sessions", async () => {
      const testFile = join(testDir, "fabric-sessions-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/s/0000000000000070": "U2Vzc2lvbjcw",
            // "Session70"
            "f/1/s/00000000000000A3": "U2Vzc2lvbkEz"
            // "SessionA3"
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.sessions.size).to.equal(2);
      const session70 = fabric.sessions.get("0000000000000070");
      expect(session70).to.exist;
      expect(Bytes.toString(session70.raw)).to.equal("Session70");
    });
    it("should load and parse global data", async () => {
      const testFile = join(testDir, "globals-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "g/fidx": "RmFicmljSW5kZXg=",
            // "FabricIndex"
            "g/lkgt": "TGFzdEtub3duR29vZFRpbWU=",
            // "LastKnownGoodTime"
            "g/sri": "U2Vzc2lvblJlc3VtcHRpb24="
            // "SessionResumption"
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.globals.fabricIndexList).to.exist;
      expect(Bytes.toString(config.globals.fabricIndexList.raw)).to.equal("FabricIndex");
      expect(config.globals.lastKnownGoodTime).to.exist;
      expect(Bytes.toString(config.globals.lastKnownGoodTime.raw)).to.equal("LastKnownGoodTime");
      expect(config.sessions.resumptionIndex).to.exist;
      expect(Bytes.toString(config.sessions.resumptionIndex.raw)).to.equal("SessionResumption");
    });
    it("should load and parse global session nodes into fabric resumptions", async () => {
      const testFile = join(testDir, "session-nodes-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            // Real TLV entry from chip.json for g/s/* - decodes to fabricIndex=1
            "g/s/pnv0rZ2xrOFePe5DbfcY1g==": "FSQBASQCcBg="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.resumptions.size).to.equal(1);
      const resumption = fabric.resumptions.get("pnv0rZ2xrOFePe5DbfcY1g==");
      expect(resumption).to.exist;
      expect(fabric.resumptionsDecoded.get("pnv0rZ2xrOFePe5DbfcY1g==")).to.exist;
    });
    it("should store ignored keys as base64", async () => {
      const testFile = join(testDir, "ignored-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "g/fs/c": "ZmFpbHNhZmVj",
            // failsafe marker
            "g/fs/n": "ZmFpbHNhZmVu",
            // failsafe marker
            "g/gdc": "Y291bnRlcg==",
            // global counter
            "g/gcc": "Y291bnRlcjI=",
            // global counter
            "g/gfl": "Z3JvdXBz",
            // group mapping
            "g/icdfl": "aWNk"
            // ICD
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.ignored.size).to.equal(6);
      expect(config.ignored.get("g/fs/c")).to.equal("ZmFpbHNhZmVj");
      expect(config.ignored.get("g/gdc")).to.equal("Y291bnRlcg==");
    });
    it("should store generic/unknown keys", async () => {
      const testFile = join(testDir, "generic-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            ExampleOpCredsCAKey1: "a2V5MQ==",
            ExampleCARootCert1: "Y2VydDE=",
            SomeUnknownKey: "dW5rbm93bg=="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.generic.size).to.equal(3);
      expect(config.generic.get("ExampleOpCredsCAKey1")).to.equal("a2V5MQ==");
      expect(config.generic.get("ExampleCARootCert1")).to.equal("Y2VydDE=");
      expect(config.generic.get("SomeUnknownKey")).to.equal("dW5rbm93bg==");
    });
    it("should preserve repl-config as-is", async () => {
      const testFile = join(testDir, "repl-config-test.json");
      const replConfig = {
        caList: {
          "1": [{ fabricId: 2, vendorId: 4939 }]
        },
        someOtherData: "test"
      };
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {},
          "repl-config": replConfig
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.replConfig).to.deep.equal(replConfig);
    });
    it("should parse hex fabric indices", async () => {
      const testFile = join(testDir, "hex-fabric-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/A/n": "SGV4RmFicmlj",
            // Fabric index 10 (0xA)
            "f/FF/m": "SGV4RmFicmljMjU1"
            // Fabric index 255 (0xFF)
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.fabrics.size).to.equal(2);
      const fabric10 = config.getFabric(10);
      expect(fabric10).to.exist;
      expect(fabric10.index).to.equal(10);
      const fabric255 = config.getFabric(255);
      expect(fabric255).to.exist;
      expect(fabric255.index).to.equal(255);
    });
  });
  describe("save", () => {
    it("should save and reload data with round-trip integrity", async () => {
      const originalFile = join(testDir, "roundtrip-original.json");
      const savedFile = join(testDir, "roundtrip-saved.json");
      const originalData = {
        "sdk-config": {
          "g/fidx": "RmFicmljSW5kZXg=",
          "g/lkgt": "TGFzdEtub3duR29vZFRpbWU=",
          "g/sri": "U2Vzc2lvblJlc3VtcHRpb24=",
          // Real TLV entry for g/s/* that decodes to fabricIndex=1, peerNodeId=112
          "g/s/resumption1": "FSQBASQCcBg=",
          "f/1/n": "SGVsbG8gTk9D",
          "f/1/i": "SGVsbG8gSUNBQw==",
          "f/1/r": "SGVsbG8gUkNBQw==",
          "f/1/m": "TWV0YWRhdGE=",
          "f/1/k/0": "SVBL",
          "f/1/s/0000000000000070": "U2Vzc2lvbjcw",
          "g/gdc": "Y291bnRlcg==",
          ExampleKey: "ZXhhbXBsZQ=="
        },
        "repl-config": {
          test: "value"
        }
      };
      await writeFile(originalFile, JSON.stringify(originalData));
      const config = new ChipConfigData();
      await config.load(originalFile);
      await config.save(savedFile);
      const config2 = new ChipConfigData();
      await config2.load(savedFile);
      expect(config2.globals.fabricIndexList.base64).to.equal("RmFicmljSW5kZXg=");
      expect(config2.globals.lastKnownGoodTime.base64).to.equal("TGFzdEtub3duR29vZFRpbWU=");
      expect(config2.sessions.resumptionIndex.base64).to.equal("U2Vzc2lvblJlc3VtcHRpb24=");
      const fabric = config2.getFabric(1);
      expect(fabric.noc.base64).to.equal("SGVsbG8gTk9D");
      expect(fabric.icac.base64).to.equal("SGVsbG8gSUNBQw==");
      expect(fabric.rcac.base64).to.equal("SGVsbG8gUkNBQw==");
      expect(fabric.metadata.base64).to.equal("TWV0YWRhdGE=");
      expect(fabric.keys.get(0).base64).to.equal("SVBL");
      expect(fabric.sessions.get("0000000000000070").base64).to.equal("U2Vzc2lvbjcw");
      expect(fabric.resumptions.get("resumption1").base64).to.equal("FSQBASQCcBg=");
      expect(config2.ignored.get("g/gdc")).to.equal("Y291bnRlcg==");
      expect(config2.generic.get("ExampleKey")).to.equal("ZXhhbXBsZQ==");
      expect(config2.replConfig).to.deep.equal({ test: "value" });
    });
    it("should produce valid JSON output", async () => {
      const testFile = join(testDir, "valid-json-test.json");
      const config = new ChipConfigData();
      config.globals.fabricIndexList = {
        raw: new Uint8Array([1, 2, 3]),
        base64: "AQID"
      };
      await config.save(testFile);
      const content = await readFile(testFile, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed["sdk-config"]["g/fidx"]).to.equal("AQID");
    });
    it("should not include repl-config when empty", async () => {
      const testFile = join(testDir, "no-repl-config-test.json");
      const config = new ChipConfigData();
      config.globals.fabricIndexList = {
        raw: new Uint8Array([1, 2, 3]),
        base64: "AQID"
      };
      await config.save(testFile);
      const content = await readFile(testFile, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed["repl-config"]).to.be.undefined;
    });
  });
  describe("getFabricIndices", () => {
    it("should return sorted fabric indices", async () => {
      const testFile = join(testDir, "fabric-indices-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/3/n": "dGVzdA==",
            "f/1/n": "dGVzdA==",
            "f/A/n": "dGVzdA==",
            // 10 in hex
            "f/2/n": "dGVzdA=="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const indices = config.getFabricIndices();
      expect(indices).to.deep.equal([1, 2, 3, 10]);
    });
  });
  describe("TLV decoding", () => {
    it("should decode fabric metadata TLV", async () => {
      const testFile = join(testDir, "tlv-metadata-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/m": "FSUASxMsAQAY"
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.metadata).to.exist;
      expect(fabric.metadataDecoded).to.exist;
      expect(fabric.metadataDecoded.vendorId).to.equal(4939);
      expect(fabric.metadataDecoded.label).to.equal("");
    });
    it("should decode fabric index list TLV", async () => {
      const testFile = join(testDir, "tlv-fidx-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "g/fidx": "FSQAAjYBBAEYGA=="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.globals.fabricIndexList).to.exist;
      expect(config.globals.fabricIndexListDecoded).to.exist;
      expect(config.globals.fabricIndexListDecoded.nextFabricIndex).to.equal(2);
      expect(config.globals.fabricIndexListDecoded.fabricIndices).to.deep.equal([1]);
    });
    it("should decode last known good time TLV", async () => {
      const testFile = join(testDir, "tlv-lkgt-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "g/lkgt": "FSYAgKi8LBg="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.globals.lastKnownGoodTime).to.exist;
      expect(config.globals.lastKnownGoodTimeDecoded).to.exist;
      expect(config.globals.lastKnownGoodTimeDecoded.epochSeconds).to.be.a("number");
      expect(config.globals.lastKnownGoodTimeDecoded.epochSeconds).to.be.greaterThan(0);
    });
    it("should decode group key set TLV (IPK)", async () => {
      const testFile = join(testDir, "tlv-ipk-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/k/0": "FSQBACQCATYDFSQEACUFLSgwBhDzc7Jr6Sc58QxRECtgZOCeGBUkBAAkBQAwBhAAAAAAAAAAAAAAAAAAAAAAGBUkBAAkBQAwBhAAAAAAAAAAAAAAAAAAAAAAGBglB///GA=="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.keys.has(0)).to.be.true;
      expect(fabric.keysDecoded.has(0)).to.be.true;
      const ipk = fabric.keysDecoded.get(0);
      expect(ipk).to.exist;
      expect(ipk.policy).to.equal(0);
      expect(ipk.keyCount).to.equal(1);
      expect(ipk.keys).to.be.an("array");
      expect(ipk.keys.length).to.equal(3);
      expect(ipk.groupKeySetId).to.equal(65535);
      expect(ipk.keys[0].key).to.be.instanceOf(Uint8Array);
      expect(ipk.keys[0].key.byteLength).to.equal(16);
    });
    it("should decode session resumption index TLV", async () => {
      const testFile = join(testDir, "tlv-sri-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "g/sri": "FhUkAQEkAnAYFSQBASQCoxgVJAEBJAI3GBUkAQEkAocYFSQBASQCURgVJAEBJAJhGBUkAQEkAlcYFSQBASQCVRgVJAEBJAJmGBUkAQEkAhcYFSQBASQCeRgVJAEBJAJDGBUkAQEkAnoYFSQBASQCOhgVJAEBJAJUGBUkAQEkAkQYFSQBASQCOBgY"
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.sessions.resumptionIndex).to.exist;
      expect(config.sessions.resumptionIndexDecoded).to.exist;
      expect(config.sessions.resumptionIndexDecoded).to.be.an("array");
      expect(config.sessions.resumptionIndexDecoded.length).to.be.greaterThan(0);
      const firstEntry = config.sessions.resumptionIndexDecoded[0];
      expect(firstEntry.fabricIndex).to.equal(1);
      expect(typeof firstEntry.peerNodeId === "number" || typeof firstEntry.peerNodeId === "bigint").to.be.true;
    });
    it("should decode session resumption details TLV", async () => {
      const testFile = join(testDir, "tlv-session-details-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/s/0000000000000070": "FTADEKZ79K2dsazhXj3uQ233GNYwBCAJG2Lyb2YqHGO0unkRCD1CAvZwRbLOukMYvRMA2a/kZzAFDAAAAAAAAAAAAAAAABg="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.sessions.has("0000000000000070")).to.be.true;
      expect(fabric.sessionsDecoded.has("0000000000000070")).to.be.true;
      const session = fabric.sessionsDecoded.get("0000000000000070");
      expect(session).to.exist;
      expect(session.resumptionId).to.be.instanceOf(Uint8Array);
      expect(session.resumptionId.byteLength).to.equal(16);
      expect(session.sharedSecret).to.be.instanceOf(Uint8Array);
      expect(session.sharedSecret.byteLength).to.equal(32);
      expect(session.cat).to.be.instanceOf(Uint8Array);
      expect(session.cat.byteLength).to.equal(12);
    });
    it("should handle invalid TLV data gracefully", async () => {
      const testFile = join(testDir, "tlv-invalid-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/m": "aW52YWxpZA=="
            // "invalid" - not valid TLV
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const fabric = config.getFabric(1);
      expect(fabric).to.exist;
      expect(fabric.metadata).to.exist;
      expect(fabric.metadataDecoded).to.be.undefined;
    });
  });
  describe("real chip.json", () => {
    it("should load the actual .ha1/chip.json file with all TLV decoded", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const fabric1 = config.getFabric(1);
      expect(fabric1).to.exist;
      expect(fabric1.noc).to.exist;
      expect(fabric1.icac).to.exist;
      expect(fabric1.rcac).to.exist;
      expect(fabric1.metadata).to.exist;
      expect(fabric1.keys.has(0)).to.be.true;
      expect(fabric1.metadataDecoded).to.exist;
      expect(fabric1.metadataDecoded.vendorId).to.equal(4939);
      expect(fabric1.metadataDecoded.label).to.equal("");
      expect(fabric1.keysDecoded.has(0)).to.be.true;
      const ipk = fabric1.keysDecoded.get(0);
      expect(ipk).to.exist;
      expect(ipk.policy).to.be.a("number");
      expect(ipk.keys).to.be.an("array");
      expect(ipk.groupKeySetId).to.equal(65535);
      expect(fabric1.sessions.size).to.be.greaterThan(0);
      expect(fabric1.sessionsDecoded.size).to.equal(fabric1.sessions.size);
      for (const [_nodeHex, sessionDecoded] of fabric1.sessionsDecoded) {
        expect(sessionDecoded.resumptionId).to.be.instanceOf(Uint8Array);
        expect(sessionDecoded.resumptionId.byteLength).to.equal(16);
        expect(sessionDecoded.sharedSecret).to.be.instanceOf(Uint8Array);
        expect(sessionDecoded.sharedSecret.byteLength).to.equal(32);
      }
      expect(config.globals.fabricIndexList).to.exist;
      expect(config.globals.fabricIndexListDecoded).to.exist;
      expect(config.globals.fabricIndexListDecoded.nextFabricIndex).to.equal(2);
      expect(config.globals.fabricIndexListDecoded.fabricIndices).to.deep.equal([1]);
      expect(config.globals.lastKnownGoodTime).to.exist;
      expect(config.globals.lastKnownGoodTimeDecoded).to.exist;
      expect(config.globals.lastKnownGoodTimeDecoded.epochSeconds).to.be.a("number");
      expect(config.sessions.resumptionIndex).to.exist;
      expect(config.sessions.resumptionIndexDecoded).to.exist;
      expect(config.sessions.resumptionIndexDecoded).to.be.an("array");
      expect(config.sessions.resumptionIndexDecoded.length).to.be.greaterThan(0);
      expect(fabric1.resumptions.size).to.be.greaterThan(0);
      expect(fabric1.resumptionsDecoded.size).to.equal(fabric1.resumptions.size);
      for (const [_resumptionId, entry] of fabric1.resumptionsDecoded) {
        expect(entry.fabricIndex).to.equal(1);
        expect(typeof entry.peerNodeId === "number" || typeof entry.peerNodeId === "bigint").to.be.true;
      }
      expect(config.generic.has("ExampleOpCredsCAKey1")).to.be.true;
      expect(config.generic.has("ExampleCARootCert1")).to.be.true;
      expect(config.replConfig).to.have.property("caList");
    });
    it("should round-trip the actual chip.json without data loss", async () => {
      const originalPath = join(process.cwd(), "../../.ha1/chip.json");
      const savedPath = join(testDir, "chip-roundtrip.json");
      const config = new ChipConfigData();
      await config.load(originalPath);
      await config.save(savedPath);
      const originalContent = JSON.parse(await readFile(originalPath, "utf-8"));
      const savedContent = JSON.parse(await readFile(savedPath, "utf-8"));
      const originalKeys = Object.keys(originalContent["sdk-config"]).sort();
      const savedKeys = Object.keys(savedContent["sdk-config"]).sort();
      expect(savedKeys).to.deep.equal(originalKeys);
      for (const key of originalKeys) {
        expect(savedContent["sdk-config"][key]).to.equal(
          originalContent["sdk-config"][key],
          `Value mismatch for key: ${key}`
        );
      }
      expect(savedContent["repl-config"]).to.deep.equal(originalContent["repl-config"]);
    });
  });
  describe("certificate operations", () => {
    it("should decode RCAC from fabric", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const rcac = config.getRcac(1);
      expect(rcac).to.exist;
      expect(rcac.cert).to.exist;
      expect(rcac.cert.subject).to.exist;
      expect(rcac.cert.subject.rcacId).to.exist;
    });
    it("should decode ICAC from fabric", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const icac = config.getIcac(1);
      expect(icac).to.exist;
      expect(icac.cert).to.exist;
      expect(icac.cert.issuer).to.exist;
      expect(icac.cert.issuer.rcacId).to.exist;
    });
    it("should decode NOC from fabric", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const noc = config.getNoc(1);
      expect(noc).to.exist;
      expect(noc.cert).to.exist;
      expect(noc.cert.subject).to.exist;
      expect(noc.cert.subject.nodeId).to.exist;
      expect(noc.cert.subject.fabricId).to.exist;
    });
    it("should return undefined for non-existent fabric", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      expect(config.getRcac(99)).to.be.undefined;
      expect(config.getIcac(99)).to.be.undefined;
      expect(config.getNoc(99)).to.be.undefined;
    });
    it("should return undefined for invalid certificate data", async () => {
      const testFile = join(testDir, "invalid-cert-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/r": "aW52YWxpZA==",
            // "invalid" - not valid certificate TLV
            "f/1/n": "aW52YWxpZA=="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.getRcac(1)).to.be.undefined;
      expect(config.getNoc(1)).to.be.undefined;
    });
    it("should verify certificate chain successfully", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const result = await config.verifyCertificateChain(1);
      expect(result.valid).to.be.true;
      expect(result.rcacValid).to.be.true;
      expect(result.icacValid).to.be.true;
      expect(result.nocValid).to.be.true;
      expect(result.error).to.be.undefined;
    });
    it("should fail verification for non-existent fabric", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const result = await config.verifyCertificateChain(99);
      expect(result.valid).to.be.false;
      expect(result.error).to.include("RCAC not found");
    });
    it("should fail verification for invalid certificate data", async () => {
      const testFile = join(testDir, "invalid-chain-test.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            "f/1/r": "aW52YWxpZA==",
            "f/1/n": "aW52YWxpZA=="
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      const result = await config.verifyCertificateChain(1);
      expect(result.valid).to.be.false;
      expect(result.error).to.include("RCAC not found");
    });
    it("should report certificate details from decoded certificates", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const rcac = config.getRcac(1);
      const icac = config.getIcac(1);
      const noc = config.getNoc(1);
      expect(rcac.cert.subject.rcacId).to.exist;
      expect(icac.cert.issuer.rcacId).to.equal(rcac.cert.subject.rcacId);
      expect(noc.cert.issuer.icacId).to.equal(icac.cert.subject.icacId);
    });
  });
  describe("getFabricConfig", () => {
    it("should extract fabric config from real chip.json", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const fabricConfig = config.getFabricConfig(1);
      expect(fabricConfig).to.exist;
      expect(fabricConfig.fabricIndex).to.equal(1);
      expect(typeof fabricConfig.fabricId === "number" || typeof fabricConfig.fabricId === "bigint").to.be.true;
      expect(typeof fabricConfig.nodeId === "number" || typeof fabricConfig.nodeId === "bigint").to.be.true;
      expect(typeof fabricConfig.rootNodeId === "number" || typeof fabricConfig.rootNodeId === "bigint").to.be.true;
      expect(fabricConfig.rootVendorId).to.equal(4939);
      expect(fabricConfig.rootCert).to.be.instanceOf(Uint8Array);
      expect(fabricConfig.rootPublicKey).to.be.instanceOf(Uint8Array);
      expect(fabricConfig.rootPublicKey.byteLength).to.equal(65);
      expect(fabricConfig.identityProtectionKey).to.be.instanceOf(Uint8Array);
      expect(fabricConfig.identityProtectionKey.byteLength).to.equal(16);
      expect(fabricConfig.intermediateCACert).to.be.instanceOf(Uint8Array);
      expect(fabricConfig.operationalCert).to.be.instanceOf(Uint8Array);
      expect(fabricConfig.label).to.equal("");
    });
    it("should return undefined for non-existent fabric", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      expect(config.getFabricConfig(99)).to.be.undefined;
    });
    it("should return undefined for fabric with missing data", async () => {
      const testFile = join(testDir, "incomplete-fabric.json");
      await writeFile(
        testFile,
        JSON.stringify({
          "sdk-config": {
            // Only has NOC, missing RCAC and metadata
            "f/1/n": "SGVsbG8gTk9D"
          }
        })
      );
      const config = new ChipConfigData();
      await config.load(testFile);
      expect(config.getFabricConfig(1)).to.be.undefined;
    });
    it("should have correct fabricId and nodeId from NOC", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const fabricConfig = config.getFabricConfig(1);
      const noc = config.getNoc(1);
      expect(fabricConfig).to.exist;
      expect(noc).to.exist;
      expect(fabricConfig.fabricId).to.equal(noc.cert.subject.fabricId);
      expect(fabricConfig.nodeId).to.equal(noc.cert.subject.nodeId);
    });
    it("should have correct rootNodeId from RCAC", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const fabricConfig = config.getFabricConfig(1);
      const rcac = config.getRcac(1);
      expect(fabricConfig).to.exist;
      expect(rcac).to.exist;
      expect(fabricConfig.rootNodeId).to.equal(rcac.cert.subject.rcacId);
    });
    it("should extract IPK from group key set 0", async () => {
      const chipJsonPath = join(process.cwd(), "../../.ha1/chip.json");
      const config = new ChipConfigData();
      await config.load(chipJsonPath);
      const fabricConfig = config.getFabricConfig(1);
      const fabric = config.getFabric(1);
      expect(fabricConfig).to.exist;
      expect(fabric).to.exist;
      const ipkKeySet = fabric.keysDecoded.get(0);
      expect(ipkKeySet).to.exist;
      const ipkEntry = ipkKeySet.keys.find((k) => k.key.byteLength === 16);
      expect(ipkEntry).to.exist;
      expect(fabricConfig.identityProtectionKey).to.deep.equal(ipkEntry.key);
    });
  });
});
//# sourceMappingURL=ChipConfigDataTest.js.map
