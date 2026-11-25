import { afterEach, describe, expect, it } from "vitest";
import { assertNetworkAllowed, isMetadataHost } from "../src/lib/security.js";

const original = process.env.FAUX_ALLOW_METADATA;

afterEach(() => {
  if (original === undefined) delete process.env.FAUX_ALLOW_METADATA;
  else process.env.FAUX_ALLOW_METADATA = original;
});

describe("isMetadataHost", () => {
  it("flags cloud metadata IPv4 addresses", () => {
    expect(isMetadataHost("169.254.169.254")).toBe(true);
    expect(isMetadataHost("100.100.100.200")).toBe(true);
    expect(isMetadataHost("169.254.0.1")).toBe(true);
  });

  it("flags metadata hostnames", () => {
    expect(isMetadataHost("metadata.google.internal")).toBe(true);
    expect(isMetadataHost("instance-data")).toBe(true);
    expect(isMetadataHost("METADATA.GOOG.".toLowerCase())).toBe(true);
  });

  it("flags IPv6 metadata and link-local addresses", () => {
    expect(isMetadataHost("[fd00:ec2::254]")).toBe(true);
    expect(isMetadataHost("fd00:ec2::254")).toBe(true);
    expect(isMetadataHost("[fe80::1]")).toBe(true);
    expect(isMetadataHost("::ffff:a9fe:a9fe")).toBe(true);
  });

  it("allows normal public and local dev hosts", () => {
    expect(isMetadataHost("example.com")).toBe(false);
    expect(isMetadataHost("127.0.0.1")).toBe(false);
    expect(isMetadataHost("localhost")).toBe(false);
    expect(isMetadataHost("10.0.0.5")).toBe(false);
    expect(isMetadataHost("192.168.1.10")).toBe(false);
    expect(isMetadataHost("[::1]")).toBe(false);
  });
});

describe("assertNetworkAllowed", () => {
  it("throws for metadata endpoints", () => {
    expect(() => assertNetworkAllowed(new URL("http://169.254.169.254/latest"))).toThrow(
      /Blocked request/,
    );
  });

  it("can be disabled with FAUX_ALLOW_METADATA=1", () => {
    process.env.FAUX_ALLOW_METADATA = "1";
    expect(() => assertNetworkAllowed(new URL("http://169.254.169.254/latest"))).not.toThrow();
  });

  it("allows public URLs", () => {
    expect(() => assertNetworkAllowed(new URL("https://example.com/data.csv"))).not.toThrow();
  });
});
