export interface ProductData {
  competitor: string;
  product_url: string;
  product_name: string | null;
  brand: string | null;
  species: 'dog' | 'cat' | 'unknown';
  food_type: 'dry food' | 'wet food' | 'mixed' | 'treats' | 'supplements' | 'unknown';
  species_confidence?: number | null;
  food_type_confidence?: number | null;
  price: number | null;
  subscription_price: number | null;
  subscription_discount: number | null;
  pack_size: string | null;
  price_per_kg: number | null;
  currency: string | null;
  in_stock: boolean | null;
  date_scraped: string;
}

export interface ScrapeError {
  url: string;
  error: string;
}

export interface ParseSitemapResponse {
  urls: string[];
  filteredUrls: string[];
  total: number;
  filtered: number;
  error?: string;
}

export interface ScrapeProductResponse {
  products: ProductData[];
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export type ScrapeStatus =
  | 'idle'
  | 'parsing'
  | 'ready'
  | 'scraping'
  | 'done'
  | 'cancelled'
  | 'error';
