import { NextRequest, NextResponse } from 'next/server';
import FirecrawlApp from '@mendable/firecrawl-js';
import { extractProducts, isPetFoodProduct } from '@/lib/product-extractor';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { url, competitor, apiKey } = await request.json();

    if (!url || !apiKey) {
      return NextResponse.json({ error: 'url and apiKey are required' }, { status: 400 });
    }

    const app = new FirecrawlApp({ apiKey });

    let scrapeResult;
    try {
      scrapeResult = await app.scrapeUrl(url, {
        formats: ['markdown', 'rawHtml'],
        onlyMainContent: false,
        timeout: 30000,
      } as Parameters<typeof app.scrapeUrl>[1]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Firecrawl error';
      return NextResponse.json({ error: msg, skipped: true }, { status: 200 });
    }

    if (!scrapeResult.success) {
      return NextResponse.json(
        { error: scrapeResult.error ?? 'Firecrawl returned failure', skipped: true },
        { status: 200 }
      );
    }

    const products = extractProducts(url, competitor || new URL(url).hostname, {
      markdown: scrapeResult.markdown,
      rawHtml: (scrapeResult as unknown as Record<string, unknown>).rawHtml as string | undefined,
      html: scrapeResult.html,
      metadata: scrapeResult.metadata as Record<string, unknown>,
    });

    const petFoodProducts = products.filter(isPetFoodProduct);

    if (petFoodProducts.length === 0) {
      return NextResponse.json({ products: [], skipped: true, skipReason: 'Not identified as pet food' });
    }

    return NextResponse.json({ products: petFoodProducts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scraping failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
