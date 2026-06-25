export interface ScrapeScope {
  dryFood: boolean;
  wetFood: boolean;
  treats: boolean;
  supplements: boolean;
}

export const DEFAULT_SCOPE: ScrapeScope = {
  dryFood: true,
  wetFood: true,
  treats: false,
  supplements: false,
};

// ── Segments always excluded (non-product page types) ───────────────────────
const PAGE_EXCLUSIONS = [
  '/blog', '/blogs/', '/news/', '/article', '/articles/',
  '/faq', '/faqs', '/about', '/contact', '/team',
  '/collections/', '/category/', '/categories/',
  '/tags/', '/tag/', '/search', '/cart', '/checkout',
  '/account', '/login', '/register', '/wishlist',
  '/sitemap', '/policies/', '/pages/terms', '/pages/privacy',
  '/pages/shipping', '/pages/returns', '/pages/faq',
  '/cdn/', '/assets/', '/static/', '/.well-known/',
  'gift-card', 'giftcard', 'voucher', 'gift_card',
  '/book', '/magazine',
  'cat-litter', 'cat_litter', '/litter',
  'flea-', 'wormer', 'parasite',
  'starter-kit', 'starter-pack', 'trial-pack',
  'accessory', 'accessories',
  '/bowl', '/bowls', '/lead/', '/leads/',
  'collar', 'harness', '/toy', '/toys', '/bed-', '/beds', '/mat', '/crate',
  'grooming', 'shampoo', 'conditioner',
];

// ── Keywords per category ────────────────────────────────────────────────────
const DRY_SIGNALS = [
  'dry-food', 'dry_food', 'kibble', 'biscuit', 'biscuits',
  'dried-food', 'grain-free-dry', 'puppy-kibble', 'adult-kibble',
];

const WET_SIGNALS = [
  'wet-food', 'wet_food', 'pouch', 'pouches', '/tray', '/trays',
  '/tin', '/tins', '-tin', '-tins', 'canned', 'in-gravy', 'in-jelly',
];

const TREAT_SIGNALS = [
  'treat', 'treats', 'chew', 'chews', 'snack', 'snacks',
  'dental-stick', 'dental-chew', 'training-treat', 'reward',
];

const SUPPLEMENT_SIGNALS = [
  'supplement', 'supplements', 'vitamin', 'vitamins', 'probiotic',
  'joint-support', 'health-booster', 'omega',
];

// Generic signals that indicate a pet food product but can't distinguish type
const GENERIC_FOOD_SIGNALS = [
  'dog-food', 'cat-food', 'dog_food', 'cat_food',
  'puppy-food', 'kitten-food', 'adult-dog', 'adult-cat',
  'senior-dog', 'senior-cat', '/food/', 'pet-food', 'natural-food', 'raw-food',
  'complete-', 'grain-free',
];

const PRODUCT_URL_PATTERN = /\/(products?|p|shop|item|buy|store)\//i;

function matches(lower: string, signals: string[]): boolean {
  return signals.some((s) => lower.includes(s));
}

export function filterPetFoodUrls(
  urls: string[],
  scope: ScrapeScope = DEFAULT_SCOPE
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);

    if (!url.startsWith('http')) continue;
    if (url.length < 20 || url.length > 600) continue;

    const lower = url.toLowerCase();

    // Always skip non-product pages
    if (PAGE_EXCLUSIONS.some((f) => lower.includes(f))) continue;

    // Determine what category this URL seems to be
    const isTreat = matches(lower, TREAT_SIGNALS);
    const isSupplement = matches(lower, SUPPLEMENT_SIGNALS);
    const isDry = matches(lower, DRY_SIGNALS);
    const isWet = matches(lower, WET_SIGNALS);
    const isGenericFood = matches(lower, GENERIC_FOOD_SIGNALS);

    // Reject categories the user doesn't want
    if (isTreat && !scope.treats) continue;
    if (isSupplement && !scope.supplements) continue;
    if (isDry && !scope.dryFood && !isTreat && !isSupplement) continue;
    if (isWet && !scope.wetFood && !isTreat && !isSupplement) continue;

    // Accept if URL signals any enabled category
    const hasPetWord = /dog|cat|puppy|kitten|feline|canine|pet/.test(lower);
    const looksLikeProduct = PRODUCT_URL_PATTERN.test(url);

    const accept =
      (scope.dryFood && isDry) ||
      (scope.wetFood && isWet) ||
      (scope.treats && isTreat) ||
      (scope.supplements && isSupplement) ||
      isGenericFood ||
      (looksLikeProduct && hasPetWord);

    if (accept) result.push(url);
  }

  return result;
}
