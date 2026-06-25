import { parse } from 'node-html-parser';
import { parsePackSize, extractPackSizeFromText } from './pack-size';
import type { ProductData } from './types';

// ─── JSON-LD ────────────────────────────────────────────────────────────────

function extractJsonLdBlocks(html: string): Record<string, unknown>[] {
  const root = parse(html);
  const results: Record<string, unknown>[] = [];

  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.text);
      if (Array.isArray(data)) results.push(...data);
      else results.push(data);
    } catch {
      // skip malformed JSON-LD
    }
  }
  return results;
}

function findProduct(blocks: Record<string, unknown>[]): Record<string, unknown> | null {
  for (const block of blocks) {
    const type = block['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return block;
    if (block['@graph']) {
      const found = (block['@graph'] as Record<string, unknown>[]).find(
        (n) => n['@type'] === 'Product' || (Array.isArray(n['@type']) && (n['@type'] as string[]).includes('Product'))
      );
      if (found) return found;
    }
  }
  return null;
}

// ─── Offers ─────────────────────────────────────────────────────────────────

interface Offer {
  price: number | null;
  currency: string | null;
  availability: boolean | null;
  name?: string | null;
  sku?: string | null;
}

function parseOffers(raw: unknown): Offer[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];

  return list
    .map((o: unknown) => {
      const offer = o as Record<string, unknown>;
      const price = offer.price != null ? parseFloat(String(offer.price)) : null;
      const currency = (offer.priceCurrency as string) || null;
      const avail = offer.availability as string | undefined;
      const availability = avail ? !/outofstock/i.test(avail) : null;
      return {
        price: isNaN(price as number) ? null : price,
        currency,
        availability,
        name: (offer.name as string) || null,
        sku: (offer.sku as string) || null,
      };
    })
    .filter((o) => o.price !== null);
}

// ─── Classification ──────────────────────────────────────────────────────────

export function detectSpecies(text: string): 'dog' | 'cat' | 'unknown' {
  const lower = text.toLowerCase();
  const dog = /\b(dog|dogs|canine|puppy|puppies|hound)\b/.test(lower);
  const cat = /\b(cat|cats|feline|kitten|kittens)\b/.test(lower);
  if (dog && !cat) return 'dog';
  if (cat && !dog) return 'cat';
  return 'unknown';
}

export function detectFoodType(text: string): 'dry food' | 'wet food' | 'mixed' | 'unknown' {
  const lower = text.toLowerCase();
  const dry = /\b(dry([\s-]+(dog|cat))?[\s-]+food|kibbles?|biscuits?|dried[\s-]+food|crunch(y)?|pellets?|complete[\s-]+dry)\b/.test(lower);
  const wet = /\b(wet([\s-]+(dog|cat))?[\s-]+food|pou?ches?|cans?\b|canned|tins?\b|tinned|jelly|gravy|mousse|p[aâ]t[eé]|terrine|loaf|broth|stew|soup|in[\s-]+jelly|in[\s-]+gravy)\b/.test(lower);
  if (dry && wet) return 'mixed';
  if (dry) return 'dry food';
  if (wet) return 'wet food';
  return 'unknown';
}

export function classifySpecies(
  productName: string | null,
  url: string,
  jsonLdDesc: string | null,
  metaDesc: string | null,
  markdown: string
): 'dog' | 'cat' | 'unknown' {
  if (productName) {
    const s = detectSpecies(productName);
    if (s !== 'unknown') return s;
  }
  if (url) {
    const s = detectSpecies(url);
    if (s !== 'unknown') return s;
  }
  if (jsonLdDesc) {
    const s = detectSpecies(jsonLdDesc);
    if (s !== 'unknown') return s;
  }
  if (metaDesc) {
    const s = detectSpecies(metaDesc);
    if (s !== 'unknown') return s;
  }
  if (markdown) {
    const s = detectSpecies(markdown.slice(0, 3000));
    if (s !== 'unknown') return s;
  }
  return 'unknown';
}

export function classifyFoodType(
  productName: string | null,
  url: string,
  jsonLdDesc: string | null,
  metaDesc: string | null,
  markdown: string
): 'dry food' | 'wet food' | 'mixed' | 'unknown' {
  if (productName) {
    const f = detectFoodType(productName);
    if (f !== 'unknown') return f;
  }
  if (url) {
    const f = detectFoodType(url);
    if (f !== 'unknown') return f;
  }
  if (jsonLdDesc) {
    const f = detectFoodType(jsonLdDesc);
    if (f !== 'unknown') return f;
  }
  if (metaDesc) {
    const f = detectFoodType(metaDesc);
    if (f !== 'unknown') return f;
  }
  if (markdown) {
    const f = detectFoodType(markdown.slice(0, 3000));
    if (f !== 'unknown') return f;
  }
  return 'unknown';
}

// ─── Price helpers ────────────────────────────────────────────────────────────

function guessCurrency(text: string): string | null {
  if (/£|GBP/.test(text)) return 'GBP';
  if (/A\$|AUD/.test(text)) return 'AUD';
  if (/C\$|CAD/.test(text)) return 'CAD';
  if (/\$|USD/.test(text)) return 'USD';
  if (/€|EUR/.test(text)) return 'EUR';
  return null;
}

function extractFirstPrice(text: string): { price: number; currency: string } | null {
  const patterns: { re: RegExp; currency: string }[] = [
    { re: /£(\d+(?:\.\d{1,2})?)/, currency: 'GBP' },
    { re: /€(\d+(?:\.\d{1,2})?)/, currency: 'EUR' },
    { re: /\$(\d+(?:\.\d{1,2})?)/, currency: 'USD' },
  ];
  for (const { re, currency } of patterns) {
    const m = text.match(re);
    if (m) return { price: parseFloat(m[1]), currency };
  }
  return null;
}

// ─── Subscription ────────────────────────────────────────────────────────────

function extractSubscription(text: string, regularPrice: number | null) {
  const subPriceRe = /(?:subscribe\s*(?:&|and)\s*save|subscription\s*price|auto.?ship)[:\s]*[£$€](\d+(?:\.\d{1,2})?)/i;
  const discountRe = /(?:save|off|discount)\s*(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*(?:off|discount|saving)/i;

  const subMatch = text.match(subPriceRe);
  let subscription_price: number | null = subMatch ? parseFloat(subMatch[1]) : null;

  const discMatch = text.match(discountRe);
  let subscription_discount: number | null = discMatch
    ? parseFloat(discMatch[1] || discMatch[2])
    : null;

  if (regularPrice && subscription_price && subscription_discount === null) {
    subscription_discount = Math.round((1 - subscription_price / regularPrice) * 100 * 10) / 10;
  }

  return { subscription_price, subscription_discount };
}

// ─── Product name cleanup ─────────────────────────────────────────────────────

function cleanTitle(title: string): string {
  // Strip common suffixes: " | Brand" or " - Shop Name"
  return title.replace(/\s*[|\-–—]\s*.{2,40}$/, '').trim();
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export interface FirecrawlResult {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  metadata?: Record<string, unknown>;
}

export function extractProducts(
  url: string,
  competitor: string,
  result: FirecrawlResult
): ProductData[] {
  const html = (result.rawHtml || result.html || '') as string;
  const markdown = (result.markdown || '') as string;
  const meta = (result.metadata || {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const jsonLd = html ? extractJsonLdBlocks(html) : [];
  const product = findProduct(jsonLd);

  // Product name
  const rawName =
    (product?.name as string) ||
    (meta.ogTitle as string) ||
    (meta.title as string) ||
    null;
  const productName = rawName ? cleanTitle(rawName) : null;

  // Brand
  const brand =
    (typeof product?.brand === 'object' && product?.brand !== null
      ? (product.brand as Record<string, unknown>).name
      : product?.brand) as string | null ||
    (meta.ogSiteName as string) ||
    null;

  const species = classifySpecies(
    productName,
    url,
    (product?.description as string) || null,
    (meta.description as string) || null,
    markdown
  );
  const foodType = classifyFoodType(
    productName,
    url,
    (product?.description as string) || null,
    (meta.description as string) || null,
    markdown
  );

  // Offers / variants
  const offers = parseOffers(product?.offers);

  const buildRow = (
    offer: Offer | null,
    nameSuffix?: string
  ): ProductData => {
    const price = offer?.price ?? null;
    let currency = offer?.currency ?? (guessCurrency(markdown.slice(0, 2000)) ?? 'GBP');

    // Fallback price from OG tags
    let finalPrice = price;
    if (finalPrice === null) {
      const ogPrice = meta['og:price:amount'] ?? meta['product:price:amount'];
      if (ogPrice) {
        finalPrice = parseFloat(String(ogPrice));
        currency = String(meta['og:price:currency'] ?? meta['product:price:currency'] ?? currency);
      }
    }
    if (finalPrice === null) {
      const found = extractFirstPrice(markdown.slice(0, 4000));
      if (found) {
        finalPrice = found.price;
        currency = found.currency;
      }
    }

    const inStock = offer?.availability ?? null;

    // Pack size: search variant name → product name → description → URL
    const packSizeSource = [offer?.name, nameSuffix, productName, product?.description as string, url]
      .filter(Boolean)
      .join(' ');
    const packSizeText = extractPackSizeFromText(packSizeSource);
    const parsed = packSizeText ? parsePackSize(packSizeText) : null;
    const pricePerKg =
      finalPrice !== null && parsed?.totalWeightKg
        ? Math.round((finalPrice / parsed.totalWeightKg) * 100) / 100
        : null;

    const sub = extractSubscription(markdown.slice(0, 5000), finalPrice);

    const rowName =
      nameSuffix && productName
        ? `${productName} — ${nameSuffix}`
        : productName;

    return {
      competitor,
      product_url: url,
      product_name: rowName,
      brand,
      species,
      food_type: foodType,
      price: finalPrice,
      subscription_price: sub.subscription_price,
      subscription_discount: sub.subscription_discount,
      pack_size: packSizeText,
      price_per_kg: pricePerKg,
      currency,
      in_stock: inStock,
      date_scraped: now,
    };
  };

  if (offers.length > 1) {
    return offers.map((o) => buildRow(o, o.name ?? undefined));
  }

  return [buildRow(offers[0] ?? null)];
}

// ─── Content guard ────────────────────────────────────────────────────────────

export function isPetFoodProduct(p: ProductData): boolean {
  if (!p.product_name) return false;
  const text = (p.product_name + ' ' + (p.brand ?? '')).toLowerCase();

  const hasAnimal = /\b(dog|cat|puppy|kitten|feline|canine|pet)\b/.test(text);
  const hasFood = /\b(food|kibble|diet|meal|recipe|nutrition|pouch|tin|can|loaf)\b/.test(text);

  if (p.species !== 'unknown' || p.food_type !== 'unknown') return true;
  return hasAnimal && hasFood;
}
