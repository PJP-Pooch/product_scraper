import { NextRequest, NextResponse } from 'next/server';
import { parseSitemap } from '@/lib/sitemap-parser';
import { filterPetFoodUrls, DEFAULT_SCOPE, type ScrapeScope } from '@/lib/url-filter';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, scope } = body as { url: string; scope?: ScrapeScope };

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Sitemap URL is required' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const allUrls = await parseSitemap(url);
    const filteredUrls = filterPetFoodUrls(allUrls, scope ?? DEFAULT_SCOPE);

    return NextResponse.json({
      urls: allUrls,
      filteredUrls,
      total: allUrls.length,
      filtered: filteredUrls.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse sitemap';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
