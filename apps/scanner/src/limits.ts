/** All scanner workload ceilings. The egress gate may impose stricter transport limits. */
export const SCAN_LIMITS = Object.freeze({
  maxPages: 8,
  maxDepth: 2,
  concurrency: 1,
  maxRequests: 10, // Eight documents plus robots.txt and sitemap.xml.
  maxBodyBytes: 1024 * 1024,
  metadataBytes: 256 * 1024,
  maxTotalBytes: 8 * 1024 * 1024 + 512 * 1024,
  requestTimeoutMs: 8000,
  scanTimeoutMs: 45000,
  maxRedirects: 5,
  maxCandidates: 100,
  maxReferences: 40,
  maxSitemapUrls: 50,
  maxRobotsRules: 200,
  maxTextLength: 500,
  maxDomElements: 30000,
  largeHtmlBytes: 512 * 1024,
  maxRobotsSitemaps: 10,
});
