'use client';

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import type { ProductData, ScrapeStatus } from '@/lib/types';
import type { ScrapeScope } from '@/lib/url-filter';

// ─── Currency ────────────────────────────────────────────────────────────────

function sym(c: string | null) {
  return ({ GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CAD: 'C$' } as Record<string, string>)[c ?? ''] ?? '';
}
function fmt(n: number | null, c: string | null) {
  return n === null ? '—' : `${sym(c)}${n.toFixed(2)}`;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

type GroupKey = 'all' | 'dog' | 'cat' | 'dry food' | 'wet food' | 'treats' | 'supplements';

function avg(ns: number[]) {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
}

function computeGroupStats(groupProducts: ProductData[]) {
  const nn = <T,>(arr: (T | null)[]): T[] => arr.filter((x): x is T => x !== null);
  const c = groupProducts.find((p) => p.currency)?.currency ?? null;
  return {
    count: groupProducts.length,
    avgPrice: avg(nn(groupProducts.map((p) => p.price))),
    avgSubPrice: avg(nn(groupProducts.map((p) => p.subscription_price))),
    avgPpkg: avg(nn(groupProducts.map((p) => p.price_per_kg))),
    avgDiscount: avg(nn(groupProducts.map((p) => p.subscription_discount))),
    inStock: groupProducts.filter((p) => p.in_stock === true).length,
    currency: c,
  };
}

function computeStats(products: ProductData[], filter: GroupKey) {
  const s =
    filter === 'all'
      ? products
      : filter === 'dog' || filter === 'cat'
      ? products.filter((p) => p.species === filter)
      : products.filter((p) => p.food_type === filter);

  const mainStats = computeGroupStats(s);

  return {
    ...mainStats,
    dogs: s.filter((p) => p.species === 'dog').length,
    cats: s.filter((p) => p.species === 'cat').length,
    dry: s.filter((p) => p.food_type === 'dry food').length,
    wet: s.filter((p) => p.food_type === 'wet food').length,
    treats: s.filter((p) => p.food_type === 'treats').length,
    supplements: s.filter((p) => p.food_type === 'supplements').length,

    dogStats: computeGroupStats(s.filter((p) => p.species === 'dog')),
    catStats: computeGroupStats(s.filter((p) => p.species === 'cat')),
    dryStats: computeGroupStats(s.filter((p) => p.food_type === 'dry food')),
    wetStats: computeGroupStats(s.filter((p) => p.food_type === 'wet food')),
    treatsStats: computeGroupStats(s.filter((p) => p.food_type === 'treats')),
    supplementsStats: computeGroupStats(s.filter((p) => p.food_type === 'supplements')),
  };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}
function SpeciesBadge({ v, conf }: { v: ProductData['species']; conf?: number | null }) {
  const m = { dog: 'bg-blue-100 text-blue-700', cat: 'bg-purple-100 text-purple-700', unknown: 'bg-gray-100 text-gray-500' };
  return (
    <div className="inline-flex items-center gap-1">
      <Badge label={v} cls={m[v]} />
      {conf != null && conf > 0 && (
        <span className="text-[10px] text-gray-400 font-mono" title={`Confidence: ${conf}%`}>
          ({conf}%)
        </span>
      )}
    </div>
  );
}
function FoodBadge({ v, conf }: { v: ProductData['food_type']; conf?: number | null }) {
  const m: Record<string, string> = {
    'dry food': 'bg-amber-100 text-amber-700',
    'wet food': 'bg-cyan-100 text-cyan-700',
    mixed: 'bg-violet-100 text-violet-700',
    treats: 'bg-orange-100 text-orange-700',
    supplements: 'bg-emerald-100 text-emerald-700',
    unknown: 'bg-gray-100 text-gray-500'
  };
  return (
    <div className="inline-flex items-center gap-1">
      <Badge label={v} cls={m[v] ?? 'bg-gray-100 text-gray-500'} />
      {conf != null && conf > 0 && (
        <span className="text-[10px] text-gray-400 font-mono" title={`Confidence: ${conf}%`}>
          ({conf}%)
        </span>
      )}
    </div>
  );
}
function StockBadge({ v }: { v: boolean | null }) {
  if (v === null) return <span className="text-gray-400 text-xs">—</span>;
  return <Badge label={v ? 'Yes' : 'No'} cls={v ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} />;
}
function StatusPill({ s }: { s: ScrapeStatus }) {
  const cls: Record<ScrapeStatus, string> = { idle: 'bg-gray-100 text-gray-600', parsing: 'bg-blue-100 text-blue-700', ready: 'bg-emerald-100 text-emerald-700', scraping: 'bg-blue-100 text-blue-700', done: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-amber-100 text-amber-700', error: 'bg-red-100 text-red-700' };
  const label: Record<ScrapeStatus, string> = { idle: 'Idle', parsing: 'Parsing', ready: 'Ready', scraping: 'Scraping', done: 'Done', cancelled: 'Cancelled', error: 'Error' };
  return <Badge label={label[s]} cls={cls[s]} />;
}

// ─── Toggle chip ──────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<string, string> = {
  amber: 'bg-amber-600 text-white border-amber-600',
  cyan: 'bg-cyan-600 text-white border-cyan-600',
  orange: 'bg-orange-600 text-white border-orange-600',
  green: 'bg-green-600 text-white border-green-600',
  blue: 'bg-blue-600 text-white border-blue-600',
  slate: 'bg-slate-600 text-white border-slate-600',
};

function ToggleChip({
  label,
  checked,
  onChange,
  color = 'blue',
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  const on = COLOR_CLASSES[color] ?? 'bg-blue-600 text-white border-blue-600';
  const off = 'bg-white text-gray-600 border-gray-300 hover:border-gray-400';
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors select-none ${checked ? on : off}`}
    >
      {checked ? '✓ ' : ''}{label}
    </button>
  );
}

// ─── Stats panel ──────────────────────────────────────────────────────────────

const GROUP_TABS: { key: GroupKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'dog', label: 'Dog' },
  { key: 'cat', label: 'Cat' },
  { key: 'dry food', label: 'Dry Food' },
  { key: 'wet food', label: 'Wet Food' },
  { key: 'treats', label: 'Treats' },
  { key: 'supplements', label: 'Supplements' },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
    </div>
  );
}

// Which stat cards to render
const ALL_STAT_KEYS = ['avgPrice', 'avgSubPrice', 'avgPpkg', 'avgDiscount', 'inStock'] as const;
type StatKey = (typeof ALL_STAT_KEYS)[number];

const STAT_LABELS: Record<StatKey, string> = {
  avgPrice: 'Avg Price',
  avgSubPrice: 'Avg Sub Price',
  avgPpkg: 'Avg Price/kg',
  avgDiscount: 'Avg Sub Discount',
  inStock: 'In Stock',
};

function SubgroupStatCard({
  title,
  stats,
  color,
}: {
  title: string;
  stats: ReturnType<typeof computeGroupStats>;
  color: 'blue' | 'purple' | 'amber' | 'cyan' | 'orange' | 'emerald';
}) {
  const themes = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-100', text: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-800' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  };

  const theme = themes[color];

  return (
    <div className={`${theme.bg} rounded-lg p-3 border ${theme.border} flex flex-col justify-between`}>
      <div>
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-semibold text-gray-800">{title}</span>
          <span className={`${theme.badge} text-[10px] px-1.5 py-0.5 rounded-full font-medium`}>
            {stats.count}
          </span>
        </div>
        {stats.count > 0 ? (
          <div className="space-y-1 text-left">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Avg Price:</span>
              <span className="font-semibold text-gray-900">{fmt(stats.avgPrice, stats.currency)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Avg Price/kg:</span>
              <span className="font-semibold text-gray-900">
                {stats.avgPpkg !== null ? `${fmt(stats.avgPpkg, stats.currency)}/kg` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">In Stock:</span>
              <span className="font-semibold text-gray-900">
                {stats.inStock} / {stats.count}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 text-center italic py-2">No products</p>
        )}
      </div>
    </div>
  );
}

function StatsPanel({
  products,
  visibleStats,
  group,
  setGroup,
}: {
  products: ProductData[];
  visibleStats: Set<StatKey>;
  group: GroupKey;
  setGroup: (g: GroupKey) => void;
}) {
  const s = computeStats(products, group);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-700">Summary Statistics</h2>
        <div className="flex gap-1 flex-wrap">
          {GROUP_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setGroup(t.key)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                group === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Products" value={String(s.count)} />
        {visibleStats.has('avgPrice') && (
          <StatCard label="Avg Price" value={s.avgPrice !== null ? fmt(s.avgPrice, s.currency) : '—'} />
        )}
        {visibleStats.has('avgSubPrice') && (
          <StatCard label="Avg Sub Price" value={s.avgSubPrice !== null ? fmt(s.avgSubPrice, s.currency) : '—'} />
        )}
        {visibleStats.has('avgPpkg') && (
          <StatCard label="Avg Price/kg" value={s.avgPpkg !== null ? `${fmt(s.avgPpkg, s.currency)}/kg` : '—'} />
        )}
        {visibleStats.has('avgDiscount') && (
          <StatCard label="Avg Sub Discount" value={s.avgDiscount !== null ? `${s.avgDiscount.toFixed(1)}%` : '—'} />
        )}
        {visibleStats.has('inStock') && (
          <StatCard label="In Stock" value={s.count > 0 ? `${s.inStock} / ${s.count}` : '—'} />
        )}
      </div>

      {s.count > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(group === 'all' || group === 'dry food' || group === 'wet food' || group === 'treats' || group === 'supplements') && (
            <>
              <SubgroupStatCard title="Dog products" stats={s.dogStats} color="blue" />
              <SubgroupStatCard title="Cat products" stats={s.catStats} color="purple" />
            </>
          )}

          {(group === 'all' || group === 'dog' || group === 'cat') && (
            <>
              <SubgroupStatCard title="Dry food" stats={s.dryStats} color="amber" />
              <SubgroupStatCard title="Wet food" stats={s.wetStats} color="cyan" />
              <SubgroupStatCard title="Treats" stats={s.treatsStats} color="orange" />
              <SubgroupStatCard title="Supplements" stats={s.supplementsStats} color="emerald" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── All column definitions ───────────────────────────────────────────────────

type ColKey =
  | 'product_name'
  | 'brand'
  | 'species'
  | 'food_type'
  | 'pack_size'
  | 'price'
  | 'subscription_price'
  | 'subscription_discount'
  | 'price_per_kg'
  | 'in_stock'
  | 'link';

const COL_LABELS: Record<ColKey, string> = {
  product_name: 'Product Name',
  brand: 'Brand',
  species: 'Species',
  food_type: 'Food Type',
  pack_size: 'Pack Size',
  price: 'Price',
  subscription_price: 'Sub Price',
  subscription_discount: 'Disc %',
  price_per_kg: 'Price/kg',
  in_stock: 'In Stock',
  link: 'Link',
};

const DEFAULT_VISIBLE_COLS: ColKey[] = [
  'product_name', 'brand', 'species', 'food_type', 'pack_size',
  'price', 'subscription_price', 'subscription_discount', 'price_per_kg', 'in_stock', 'link',
];

// ─── Results table ────────────────────────────────────────────────────────────

function ResultsTable({ products, visibleCols }: { products: ProductData[]; visibleCols: Set<ColKey> }) {
  const cols = (Object.keys(COL_LABELS) as ColKey[]).filter((k) => visibleCols.has(k));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-xs divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                {COL_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-50">
          {products.map((p, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              {visibleCols.has('product_name') && (
                <td className="px-3 py-2 max-w-[220px] truncate font-medium text-gray-900" title={p.product_name ?? ''}>
                  {p.product_name ?? '—'}
                </td>
              )}
              {visibleCols.has('brand') && (
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.brand ?? '—'}</td>
              )}
              {visibleCols.has('species') && (
                <td className="px-3 py-2 whitespace-nowrap">
                  <SpeciesBadge v={p.species} conf={p.species_confidence} />
                </td>
              )}
              {visibleCols.has('food_type') && (
                <td className="px-3 py-2 whitespace-nowrap">
                  <FoodBadge v={p.food_type} conf={p.food_type_confidence} />
                </td>
              )}
              {visibleCols.has('pack_size') && (
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.pack_size ?? '—'}</td>
              )}
              {visibleCols.has('price') && (
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap tabular-nums">
                  {fmt(p.price, p.currency)}
                </td>
              )}
              {visibleCols.has('subscription_price') && (
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">
                  {fmt(p.subscription_price, p.currency)}
                </td>
              )}
              {visibleCols.has('subscription_discount') && (
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">
                  {p.subscription_discount !== null ? `${p.subscription_discount.toFixed(1)}%` : '—'}
                </td>
              )}
              {visibleCols.has('price_per_kg') && (
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">
                  {p.price_per_kg !== null ? `${fmt(p.price_per_kg, p.currency)}/kg` : '—'}
                </td>
              )}
              {visibleCols.has('in_stock') && (
                <td className="px-3 py-2 whitespace-nowrap"><StockBadge v={p.in_stock} /></td>
              )}
              {visibleCols.has('link') && (
                <td className="px-3 py-2 whitespace-nowrap">
                  <a href={p.product_url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline">
                    View ↗
                  </a>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{text}</p>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [apiKey, setApiKey] = useState('');

  // Scrape scope
  const [scope, setScope] = useState<ScrapeScope>({
    dryFood: true,
    wetFood: true,
    treats: false,
    supplements: false,
  });

  // Column/metric visibility
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE_COLS));
  const [visibleStats, setVisibleStats] = useState<Set<StatKey>>(new Set(ALL_STAT_KEYS));

  // Runtime state
  const [status, setStatus] = useState<ScrapeStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [filteredUrls, setFilteredUrls] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ProductData[]>([]);
  const [errors, setErrors] = useState<{ url: string; error: string }[]>([]);
  const [showUrls, setShowUrls] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const cancelRef = useRef(false);

  const [filterSpecies, setFilterSpecies] = useState<'all' | 'dog' | 'cat' | 'unknown'>('all');
  const [filterFoodType, setFilterFoodType] = useState<'all' | 'dry food' | 'wet food' | 'mixed' | 'treats' | 'supplements' | 'unknown'>('all');
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [activeTab, setActiveTab] = useState<GroupKey>('all');

  const [urlsText, setUrlsText] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('fc-api-key');
    if (stored) setApiKey(stored);
  }, []);

  useEffect(() => {
    if (!sitemapUrl) return;
    try {
      const h = new URL(sitemapUrl).hostname.replace(/^www\./, '');
      setCompetitor((prev) => prev || h.split('.')[0]);
    } catch {}
  }, [sitemapUrl]);

  useEffect(() => {
    setUrlsText(filteredUrls.join('\n'));
  }, [filteredUrls]);

  const saveApiKey = (v: string) => {
    setApiKey(v);
    localStorage.setItem('fc-api-key', v);
  };

  const toggleScope = (key: keyof ScrapeScope, v: boolean) =>
    setScope((prev) => ({ ...prev, [key]: v }));

  const toggleCol = (key: ColKey, v: boolean) =>
    setVisibleCols((prev) => {
      const s = new Set(prev);
      v ? s.add(key) : s.delete(key);
      return s;
    });

  const toggleStat = (key: StatKey, v: boolean) =>
    setVisibleStats((prev) => {
      const s = new Set(prev);
      v ? s.add(key) : s.delete(key);
      return s;
    });

  // ── Parse sitemap ───────────────────────────────────────────────────────────
  const parseSitemap = async () => {
    if (!sitemapUrl.trim() || !apiKey.trim()) {
      alert('Enter a sitemap URL and your Firecrawl API key first.');
      return;
    }
    const hasScope = Object.values(scope).some(Boolean);
    if (!hasScope) {
      alert('Select at least one product type to scrape.');
      return;
    }

    setStatus('parsing');
    setStatusMsg('Fetching and parsing sitemap…');
    setResults([]);
    setErrors([]);
    setFilteredUrls([]);
    cancelRef.current = false;

    try {
      const res = await fetch('/api/parse-sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sitemapUrl.trim(), scope }),
      });
      const data = await res.json();
      if (data.error) { setStatus('error'); setStatusMsg(data.error); return; }
      setFilteredUrls(data.filteredUrls);
      setStatus('ready');
      setStatusMsg(`Sitemap: ${data.total.toLocaleString()} URLs total — ${data.filtered} match your scope.`);
    } catch (e) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message : 'Failed to parse sitemap');
    }
  };

  // ── Scrape products ─────────────────────────────────────────────────────────
  const startScraping = async (urls: string[]) => {
    setStatus('scraping');
    setProgress({ current: 0, total: urls.length });
    cancelRef.current = false;

    let urlIndex = 0;
    let completed = 0;
    const competitorName = competitor.trim() || (() => { try { return new URL(sitemapUrl).hostname; } catch { return 'unknown'; } })();

    const worker = async () => {
      while (urlIndex < urls.length && !cancelRef.current) {
        const url = urls[urlIndex++];
        setCurrentUrl(url);
        try {
          const res = await fetch('/api/scrape-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, competitor: competitorName, apiKey }),
          });
          const data = await res.json();
          if (data.products?.length) setResults((prev) => [...prev, ...data.products]);
          else if (data.error && !data.skipped) setErrors((prev) => [...prev, { url, error: data.error }]);
        } catch (e) {
          setErrors((prev) => [...prev, { url, error: e instanceof Error ? e.message : 'Network error' }]);
        }
        completed++;
        setProgress({ current: completed, total: urls.length });
        setStatusMsg(`Scraping ${completed} / ${urls.length}…`);
        await new Promise((r) => setTimeout(r, 700));
      }
    };

    await Promise.all([worker(), worker()]);
    setCurrentUrl('');
    if (cancelRef.current) {
      setStatus('cancelled');
      setStatusMsg(`Cancelled after ${completed} of ${urls.length} products.`);
    } else {
      setStatus('done');
      setStatusMsg(`Done! Checked ${completed} pages.`);
    }
  };

  const retryErrors = () => {
    const urls = errors.map((e) => e.url);
    setErrors([]);
    setFilteredUrls(urls);
    setStatus('ready');
    setStatusMsg(`${urls.length} URLs queued for retry.`);
  };

  const exportCSV = () => {
    if (!filteredProducts.length) return;
    const blob = new Blob([Papa.unparse(filteredProducts)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `pet-food-${competitor || 'scrape'}-${new Date().toISOString().split('T')[0]}.csv`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isRunning = status === 'parsing' || status === 'scraping';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const filteredProducts = results.filter((p) => {
    const speciesMatch = filterSpecies === 'all' || p.species === filterSpecies;
    const foodTypeMatch = filterFoodType === 'all' || p.food_type === filterFoodType;

    let confidenceMatch = true;
    if (showLowConfidence) {
      const speciesConf = p.species_confidence ?? 0;
      const foodConf = p.food_type_confidence ?? 0;
      confidenceMatch = speciesConf < 50 || foodConf < 50;
    }

    return speciesMatch && foodTypeMatch && confidenceMatch;
  });

  const parsedUrls = urlsText
    .split('\n')
    .map((u) => u.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Pet Food Competitor Scraper</h1>
            <p className="text-xs text-gray-500">Extract structured product data via Firecrawl</p>
          </div>
          {results.length > 0 && (
            <button onClick={exportCSV}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md">
              ↓ Export CSV ({results.length})
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── Config card ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">

          {/* Connection inputs */}
          <div>
            <SectionLabel text="Connection" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Sitemap URL <span className="text-red-500">*</span>
                </label>
                <input type="url" value={sitemapUrl} onChange={(e) => setSitemapUrl(e.target.value)}
                  placeholder="https://competitor.com/sitemap.xml" disabled={isRunning}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Competitor Name</label>
                <input type="text" value={competitor} onChange={(e) => setCompetitor(e.target.value)}
                  placeholder="Auto-detected" disabled={isRunning}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Firecrawl API Key <span className="text-red-500">*</span>
                </label>
                <input type="password" value={apiKey} onChange={(e) => saveApiKey(e.target.value)}
                  placeholder="fc-xxxxxxxxxxxxxxxx" disabled={isRunning}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
              </div>
            </div>
          </div>

          {/* Scrape scope */}
          <div>
            <SectionLabel text="What to scrape" />
            <div className="flex flex-wrap gap-2">
              <ToggleChip label="Dry Food" checked={scope.dryFood} onChange={(v) => toggleScope('dryFood', v)} color="amber" />
              <ToggleChip label="Wet Food" checked={scope.wetFood} onChange={(v) => toggleScope('wetFood', v)} color="cyan" />
              <ToggleChip label="Treats / Chews" checked={scope.treats} onChange={(v) => toggleScope('treats', v)} color="orange" />
              <ToggleChip label="Supplements" checked={scope.supplements} onChange={(v) => toggleScope('supplements', v)} color="green" />
            </div>
          </div>

          {/* Metrics to show */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <SectionLabel text="Stats to display" />
              <div className="flex flex-wrap gap-2">
                {ALL_STAT_KEYS.map((k) => (
                  <ToggleChip key={k} label={STAT_LABELS[k]} checked={visibleStats.has(k)} onChange={(v) => toggleStat(k, v)} color="blue" />
                ))}
              </div>
            </div>
            <div>
              <SectionLabel text="Table columns" />
              <div className="flex flex-wrap gap-2">
                {(Object.keys(COL_LABELS) as ColKey[]).filter((k) => k !== 'product_name' && k !== 'link').map((k) => (
                  <ToggleChip key={k} label={COL_LABELS[k]} checked={visibleCols.has(k)} onChange={(v) => toggleCol(k, v)} color="slate" />
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
            {(status === 'idle' || status === 'error') && (
              <button onClick={parseSitemap} disabled={!sitemapUrl || !apiKey}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                Parse Sitemap
              </button>
            )}
            {status === 'ready' && (
              <>
                <button onClick={() => startScraping(parsedUrls)}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md">
                  Start Scraping ({parsedUrls.length} URLs)
                </button>
                <button onClick={parseSitemap}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md">
                  Re-parse
                </button>
              </>
            )}
            {isRunning && (
              <button onClick={() => { cancelRef.current = true; }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md">
                Cancel
              </button>
            )}
            {(status === 'done' || status === 'cancelled') && (
              <>
                <button onClick={() => { setStatus('idle'); setStatusMsg(''); setSitemapUrl(''); setCompetitor(''); setResults([]); setErrors([]); setFilteredUrls([]); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md">
                  New Scrape
                </button>
                {errors.length > 0 && (
                  <button onClick={retryErrors}
                    className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md">
                    Retry {errors.length} Failed
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Progress ─────────────────────────────────────────────────────── */}
        {status !== 'idle' && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">{statusMsg}</p>
              <StatusPill s={status} />
            </div>

            {status === 'scraping' && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{progress.current} / {progress.total}</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                {currentUrl && <p className="text-xs text-gray-400 mt-2 truncate">↳ {currentUrl}</p>}
              </div>
            )}

            {status === 'ready' && parsedUrls.length > 0 && (
              <div className="mt-3">
                <button onClick={() => setShowUrls((v) => !v)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  {showUrls ? 'Hide URLs' : `View / Edit ${parsedUrls.length} URLs`}
                </button>
                {showUrls && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1">
                      Edit the list below (one URL per line):
                    </p>
                    <textarea
                      value={urlsText}
                      onChange={(e) => setUrlsText(e.target.value)}
                      rows={10}
                      className="w-full p-2.5 text-xs font-mono border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-700"
                      placeholder="Enter URLs to scrape, one per line..."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        {results.length > 0 && (
          <StatsPanel
            products={results}
            visibleStats={visibleStats}
            group={activeTab}
            setGroup={(tab) => {
              setActiveTab(tab);
              if (tab === 'all') {
                setFilterSpecies('all');
                setFilterFoodType('all');
              } else if (tab === 'dog' || tab === 'cat') {
                setFilterSpecies(tab);
                setFilterFoodType('all');
              } else {
                setFilterSpecies('all');
                setFilterFoodType(tab as any);
              }
            }}
          />
        )}

        {/* ── Results table ────────────────────────────────────────────────── */}
        {results.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-sm font-medium text-gray-700">
                  Product Data
                  <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {filteredProducts.length} {filteredProducts.length !== results.length && `of ${results.length}`}
                  </span>
                </h2>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Species:</span>
                    <select
                      value={filterSpecies}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setFilterSpecies(val);
                        if (val === 'all' && filterFoodType === 'all') {
                          setActiveTab('all');
                        } else if (val === 'dog' && filterFoodType === 'all') {
                          setActiveTab('dog');
                        } else if (val === 'cat' && filterFoodType === 'all') {
                          setActiveTab('cat');
                        } else if (filterFoodType !== 'all' && val === 'all') {
                          if (['dry food', 'wet food', 'treats', 'supplements'].includes(filterFoodType)) {
                            setActiveTab(filterFoodType as GroupKey);
                          }
                        } else {
                          setActiveTab('all');
                        }
                      }}
                      className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-700 font-medium"
                    >
                      <option value="all">All</option>
                      <option value="dog">Dog</option>
                      <option value="cat">Cat</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>

                   <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Food Type:</span>
                    <select
                      value={filterFoodType}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setFilterFoodType(val);
                        if (filterSpecies === 'all' && val === 'all') {
                          setActiveTab('all');
                        } else if (filterSpecies === 'dog' && val === 'all') {
                          setActiveTab('dog');
                        } else if (filterSpecies === 'cat' && val === 'all') {
                          setActiveTab('cat');
                        } else if (filterSpecies === 'all' && ['dry food', 'wet food', 'treats', 'supplements'].includes(val)) {
                          setActiveTab(val as GroupKey);
                        } else {
                          setActiveTab('all');
                        }
                      }}
                      className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-700 font-medium"
                    >
                      <option value="all">All</option>
                      <option value="dry food">Dry Food</option>
                      <option value="wet food">Wet Food</option>
                      <option value="mixed">Mixed</option>
                      <option value="treats">Treats</option>
                      <option value="supplements">Supplements</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 ml-2 border-l border-gray-200 pl-3">
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showLowConfidence}
                        onChange={(e) => setShowLowConfidence(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <span>Low Confidence (&lt;50%)</span>
                    </label>
                  </div>
                </div>
              </div>

              <button onClick={exportCSV}
                className="text-xs text-gray-600 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-md font-medium">
                Export CSV
              </button>
            </div>
            <ResultsTable products={filteredProducts} visibleCols={visibleCols} />
          </div>
        )}

        {/* ── Errors ───────────────────────────────────────────────────────── */}
        {errors.length > 0 && (
          <div className="bg-white border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-red-700">
                Errors
                <span className="ml-2 bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {errors.length}
                </span>
              </h2>
              <button onClick={() => setShowErrors((v) => !v)}
                className="text-xs text-gray-500 hover:text-gray-700">
                {showErrors ? 'Hide' : 'Show'}
              </button>
            </div>
            {showErrors && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto mt-2">
                {errors.map((e, i) => (
                  <div key={i} className="text-xs bg-red-50 rounded p-2">
                    <a href={e.url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline block truncate mb-0.5">{e.url}</a>
                    <span className="text-red-600">{e.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
