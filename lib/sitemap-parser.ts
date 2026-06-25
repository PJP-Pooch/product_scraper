import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['url', 'sitemap'].includes(name),
  parseTagValue: true,
});

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SitemapParser/1.0; +https://example.com)',
      'Accept': 'application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  return res.text();
}

async function parseSitemapXml(url: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];

  let text: string;
  try {
    text = await fetchText(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch sitemap: ${msg}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Sitemap XML could not be parsed — check the URL returns valid XML');
  }

  // Sitemap index: contains child sitemaps
  if (parsed.sitemapindex) {
    const index = parsed.sitemapindex as Record<string, unknown>;
    const children = (index.sitemap as unknown[]) || [];
    const allUrls: string[] = [];

    // Limit child sitemaps to avoid timeouts
    for (const child of children.slice(0, 25)) {
      const loc = typeof child === 'string' ? child : (child as Record<string, unknown>).loc as string;
      if (!loc) continue;
      try {
        const childUrls = await parseSitemapXml(String(loc), depth + 1);
        allUrls.push(...childUrls);
      } catch {
        // Skip failed child sitemaps silently
      }
    }
    return allUrls;
  }

  // Regular sitemap
  if (parsed.urlset) {
    const urlset = parsed.urlset as Record<string, unknown>;
    const urls = (urlset.url as unknown[]) || [];
    return urls
      .map((u) => {
        if (typeof u === 'string') return u;
        return String((u as Record<string, unknown>).loc || '');
      })
      .filter(Boolean);
  }

  return [];
}

export async function parseSitemap(url: string): Promise<string[]> {
  return parseSitemapXml(url, 0);
}
