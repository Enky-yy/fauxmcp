/**
 * Network safety helpers.
 *
 * We block cloud metadata endpoints and link-local addresses by default to
 * reduce the blast radius of prompt-injected fetches (SSRF). Loopback and
 * private ranges stay allowed so local dev servers remain usable; set
 * FAUX_ALLOW_METADATA=1 to disable this blocklist entirely.
 */

const METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data", // OpenStack
]);

const METADATA_IPS = new Set([
  "169.254.169.254", // AWS / Azure / GCP / Oracle / DigitalOcean IMDS
  "100.100.100.200", // Alibaba Cloud
  "fd00:ec2::254", // AWS IMDS over IPv6
]);

/** True when the metadata blocklist has been explicitly disabled. */
export function metadataBlockingDisabled(): boolean {
  const value = (process.env.FAUX_ALLOW_METADATA ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeHost(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

function isLinkLocalV4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  return a === 169 && b === 254;
}

function isLinkLocalV6(host: string): boolean {
  if (!host.includes(":")) return false;

  // IPv4-mapped IPv6 is normalized to hex by the URL parser,
  // e.g. ::ffff:169.254.169.254 becomes ::ffff:a9fe:a9fe.
  if (host.includes(":")) {
    if (host.includes("a9fe") && /(^|:)ffff:/.test(host)) return true;
    const dotted = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted && isLinkLocalV4(dotted[1])) return true;
  }

  const first = host.split(":")[0];
  if (first === "") return false; // compressed form such as ::1
  const value = Number.parseInt(first, 16);
  return Number.isFinite(value) && value >= 0xfe80 && value <= 0xfebf;
}

/** True when the hostname points at a metadata service or link-local range. */
export function isMetadataHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (METADATA_HOSTNAMES.has(host)) return true;
  if (METADATA_IPS.has(host)) return true;
  if (host.startsWith("fd00:ec2:")) return true;
  return isLinkLocalV4(host) || isLinkLocalV6(host);
}

/** Throw when the URL targets a blocked metadata/link-local host. */
export function assertNetworkAllowed(url: URL): void {
  if (metadataBlockingDisabled()) return;
  if (isMetadataHost(url.hostname)) {
    throw new Error(
      `Blocked request to metadata/link-local host "${url.hostname}" (possible SSRF). ` +
        `Set FAUX_ALLOW_METADATA=1 to allow it.`,
    );
  }
}

/** Throw unless the URL uses http: or https:. */
export function assertHttpProtocol(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http:// and https:// URLs are allowed (got ${url.protocol})`);
  }
}

/** Strip embedded credentials before a URL appears in an error message. */
export function redactUrl(url: URL | string): string {
  try {
    const parsed = typeof url === "string" ? new URL(url) : new URL(url.href);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
    }
    return parsed.href;
  } catch {
    return typeof url === "string" ? url : url.href;
  }
}
