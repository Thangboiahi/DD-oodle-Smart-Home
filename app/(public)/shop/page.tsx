'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { SubscriptionTier } from '@/lib/protocol/contract';
import { TIER_CATALOG } from '@/lib/entitlements/resolver';
import {
  CORE_PLATFORM_META,
  MODULE_CATEGORIES,
  ModuleCategory,
} from '@/lib/catalog/hardwareRegistry';
import { LiveCatalogModule, useLiveStoreCatalog } from '@/lib/catalog/storeSync';
import {
  buildWhatsAppQuoteText,
  generateQuoteIdentifiers,
  QuoteHomeType,
  QuoteLineItem,
  QuoteRecord,
  submitQuoteLead,
} from '@/lib/quotes/quoteService';
import {
  Badge,
  Button,
  SegmentedControl,
  TactileSwitch,
  ThemedSelect,
  useToast,
} from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

const HOME_TYPE_OPTIONS: Array<{ value: QuoteHomeType; label: string }> = [
  { value: '1BHK', label: '1BHK Apartment' },
  { value: '2BHK', label: '2BHK Apartment' },
  { value: '3BHK', label: '3BHK Apartment' },
  { value: 'Duplex', label: 'Duplex / Independent House' },
  { value: 'Commercial', label: 'Commercial / Office / Clinic' },
];

function ShopWorkspace() {
  const searchParams = useSearchParams();
  const { visibleModules, storeConfig } = useLiveStoreCatalog();
  const { pushToast } = useToast();

  const initialHighlight = searchParams?.get('highlight')?.toUpperCase() || '';
  const initialPhase = searchParams?.get('phase') === '23' ? '23' : 'ALL';
  const initialDfy = searchParams?.get('dfy3d') === '1';

  const [phaseFilter, setPhaseFilter] = useState<'ALL' | '1' | '23'>(initialPhase);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ModuleCategory>('ALL');
  const [query, setQuery] = useState(initialHighlight);
  const [expandedSpecCode, setExpandedSpecCode] = useState<string | null>(
    initialHighlight || null
  );

  // Cart & Configurator state
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    initialHighlight
      ? { [initialHighlight]: 1 }
      : { 'PWR-01': 2, 'WAT-01': 1 }
  );
  const [includeInstallation, setIncludeInstallation] = useState<boolean>(true);
  const [includeDfy3d, setIncludeDfy3d] = useState<boolean>(initialDfy);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('plus');

  // Quote Sheet state
  const [quoteSheetOpen, setQuoteSheetOpen] = useState<boolean>(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('+91');
  const [buyerCity, setBuyerCity] = useState('Imphal');
  const [homeType, setHomeType] = useState<QuoteHomeType>('2BHK');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedQuote, setSubmittedQuote] = useState<{
    quote: QuoteRecord;
    whatsappUrl: string;
    syncedCloud: boolean;
  } | null>(null);

  const filteredModules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleModules.filter((m) => {
      if (phaseFilter === '1' && m.phase !== 1) return false;
      if (phaseFilter === '23' && m.phase < 2) return false;
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) return false;
      if (
        q &&
        !`${m.module_code} ${m.name} ${m.tagline} ${m.category}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [visibleModules, phaseFilter, categoryFilter, query]);

  const moduleMap = useMemo(() => {
    const map: Record<string, LiveCatalogModule> = {};
    for (const m of visibleModules) map[m.module_code] = m;
    return map;
  }, [visibleModules]);

  const cartItems: QuoteLineItem[] = useMemo(() => {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([code, qty]) => {
        const mod = moduleMap[code];
        if (!mod) return null;
        return {
          module_code: mod.module_code,
          name: mod.name,
          qty,
          unitRetailInr: mod.retailInr,
          unitInstallInr: mod.installInr,
          unitBomInr: mod.bomInr,
        };
      })
      .filter((x): x is QuoteLineItem => Boolean(x));
  }, [quantities, moduleMap]);

  const totalUnits = cartItems.reduce((acc, i) => acc + i.qty, 0);
  const hardwareSubtotalInr = cartItems.reduce((acc, i) => acc + i.unitRetailInr * i.qty, 0);
  const installationTotalInr = includeInstallation
    ? cartItems.reduce((acc, i) => acc + i.unitInstallInr * i.qty, 0)
    : 0;
  const dfy3dTotalInr = includeDfy3d ? storeConfig.dfy3dPriceInr : 0;
  const subscriptionTotalInr = storeConfig.tierPrices[selectedTier] ?? 0;
  const grandTotalInr =
    hardwareSubtotalInr + installationTotalInr + dfy3dTotalInr + subscriptionTotalInr;

  const setQty = (code: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[code] ?? 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[code];
        return copy;
      }
      return { ...prev, [code]: next };
    });
  };

  const handleSubmitQuote = async () => {
    if (cartItems.length === 0) {
      pushToast({ title: 'Select at least 1 hardware module', tone: 'warning' });
      return;
    }
    const cleanPhone = buyerPhone.trim();
    if (!buyerName.trim() || cleanPhone.replace(/\D/g, '').length < 10) {
      pushToast({
        title: 'Enter your Name and 10-digit WhatsApp number',
        tone: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { quote_id, quote_ref } = generateQuoteIdentifiers();
      const now = Date.now();
      const record: QuoteRecord = {
        quote_id,
        quote_ref,
        buyerName: buyerName.trim(),
        buyerPhone: cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone.replace(/\D/g, '').slice(-10)}`,
        city: buyerCity.trim() || 'India',
        homeType,
        notes: notes.trim(),
        includeInstallation,
        includeDfy3d,
        subscriptionTier: selectedTier,
        items: cartItems,
        hardwareSubtotalInr,
        installationTotalInr,
        dfy3dTotalInr,
        subscriptionTotalInr,
        grandTotalInr,
        status: 'NEW',
        createdAtMs: now,
        updatedAtMs: now,
      };

      const res = await submitQuoteLead(record, storeConfig.whatsappSalesNumber);
      setSubmittedQuote({
        quote: record,
        whatsappUrl: res.whatsappUrl,
        syncedCloud: res.syncedCloud,
      });

      pushToast({
        title: `Quote ${quote_ref} Recorded in Admin CRM`,
        description: 'Ready in /admin Quotes tab · Click Open WhatsApp below to message sales.',
        tone: 'success',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 pb-28 space-y-6">
      {/* Storefront Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="accent">LIVE ADMIN PRICING</Badge>
            <Badge variant="success">42 v1.4 MODULES</Badge>
            {storeConfig.globalDiscountPct > 0 && (
              <Badge variant="warning">{storeConfig.globalDiscountPct}% STORE OFFER</Badge>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            DD oodle Smart Home Configurator &amp; Shop
          </h1>
          <p className="text-xs sm:text-sm text-foreground-secondary max-w-2xl">
            Pick your hardware modules, optional local installation &amp; ₹
            {storeConfig.dfy3dPriceInr} 3D Twin setup, then send an itemized quote straight to our
            WhatsApp desk.
          </p>
        </div>

        <SegmentedControl<'ALL' | '1' | '23'>
          size="sm"
          ariaLabel="Module release phase"
          value={phaseFilter}
          onChange={setPhaseFilter}
          options={[
            { value: 'ALL', label: `All (${visibleModules.length})` },
            { value: '1', label: 'Phase 1 · Available Now' },
            { value: '23', label: 'Phase 2 & 3 · Pre-Book' },
          ]}
        />
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-foreground-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search modules"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PWR-01, WAT-01, VEH-01, Smart Lock..."
            className="w-full h-10 rounded-xl border border-border bg-surface-elevated pl-9 pr-3 text-xs text-foreground focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-strip pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={cn(
              'snap-start shrink-0 rounded-full border px-3 h-8 text-xs font-medium cursor-pointer',
              categoryFilter === 'ALL'
                ? 'border-accent-border bg-accent-soft text-accent'
                : 'border-border bg-surface text-foreground-secondary'
            )}
          >
            All Categories
          </button>
          {MODULE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                'snap-start shrink-0 rounded-full border px-3 h-8 text-xs font-medium cursor-pointer',
                categoryFilter === cat
                  ? 'border-accent-border bg-accent-soft text-accent'
                  : 'border-border bg-surface text-foreground-secondary'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Module Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModules.map((mod) => {
          const qty = quantities[mod.module_code] ?? 0;
          const specOpen = expandedSpecCode === mod.module_code;
          const platformInfo = CORE_PLATFORM_META[mod.core_platform];

          return (
            <article
              key={mod.module_code}
              className={cn(
                'rounded-2xl border bg-surface p-4 flex flex-col justify-between space-y-3 transition-colors',
                qty > 0 ? 'border-primary ring-1 ring-primary/25' : 'border-border'
              )}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="accent">{mod.module_code}</Badge>
                    <Badge variant="mono">P{mod.phase}</Badge>
                  </div>
                  <Badge
                    variant={
                      mod.availability === 'IN_STOCK'
                        ? 'success'
                        : mod.availability === 'PRE_ORDER'
                        ? 'warning'
                        : 'mono'
                    }
                  >
                    {mod.availability.replace('_', ' ')}
                  </Badge>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-foreground">{mod.name}</h2>
                  <p className="text-[11px] text-foreground-secondary mt-1 leading-relaxed">
                    {mod.tagline}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-foreground-muted">
                  <span className="rounded bg-surface-elevated border border-border/60 px-1.5 py-0.5">
                    {mod.core_platform}
                  </span>
                  <span className="rounded bg-surface-elevated border border-border/60 px-1.5 py-0.5 truncate max-w-[200px]">
                    {mod.mountingSpec}
                  </span>
                </div>

                {/* Expandable Technical Spec Drawer */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSpecCode((cur) =>
                      cur === mod.module_code ? null : mod.module_code
                    )
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:underline cursor-pointer"
                >
                  <Cpu className="h-3 w-3" />
                  <span>{specOpen ? 'Hide Technical Specs' : 'Technical Specs & Capabilities'}</span>
                  {specOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>

                {specOpen && (
                  <div className="rounded-xl border border-border bg-surface-elevated p-3 space-y-2 text-[11px]">
                    <div className="font-mono text-foreground-secondary">
                      <div>
                        <span className="text-foreground-muted">MCU:</span> {platformInfo.mcu}
                      </div>
                      <div>
                        <span className="text-foreground-muted">Electrical:</span>{' '}
                        {mod.electricalSpec}
                      </div>
                      <div>
                        <span className="text-foreground-muted">Transports:</span>{' '}
                        {mod.transports.join(' · ')}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {mod.capabilities.map((cap) => (
                        <Badge key={cap.key} variant="mono" className="text-[9px]">
                          {cap.key}:{cap.type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Price + Quantity Stepper */}
              <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                <div className="font-mono tabular-nums">
                  <div className="text-base font-bold text-foreground">
                    ₹{mod.retailInr.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-foreground-muted">
                    +₹{mod.installInr} local setup
                  </div>
                </div>

                <div className="inline-flex items-center rounded-xl border border-border bg-surface-elevated p-0.5">
                  <button
                    type="button"
                    aria-label={`Decrease quantity for ${mod.module_code}`}
                    onClick={() => setQty(mod.module_code, -1)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-foreground-secondary hover:text-foreground hover:bg-surface cursor-pointer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center font-mono text-xs font-bold tabular-nums text-foreground">
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase quantity for ${mod.module_code}`}
                    onClick={() => setQty(mod.module_code, 1)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Installation, DFY 3D Twin & Plan Selector Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
        {/* Left: Installation & DFY 3D Add-On */}
        <div className="lg:col-span-5 rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wrench className="h-4 w-4 text-primary" />
            <span>Installation &amp; On-Site Setup</span>
          </div>

          <SegmentedControl<'install' | 'hardware'>
            fullWidth
            size="sm"
            ariaLabel="Installation option"
            value={includeInstallation ? 'install' : 'hardware'}
            onChange={(v) => setIncludeInstallation(v === 'install')}
            options={[
              {
                value: 'install',
                label: `Local Installation (+₹${cartItems
                  .reduce((s, i) => s + i.unitInstallInr * i.qty, 0)
                  .toLocaleString('en-IN')})`,
              },
              { value: 'hardware', label: 'Hardware Only (DIY)' },
            ]}
          />

          <TactileSwitch
            label={`Done-For-You 3D Home Twin (₹${storeConfig.dfy3dPriceInr})`}
            sublabel="Configured on-site by DD oodle technician onto homes/{id}/layout_3d"
            checked={includeDfy3d}
            onChange={setIncludeDfy3d}
          />
        </div>

        {/* Right: Subscription Plan Selector Synced to Admin Config */}
        <div className="lg:col-span-7 rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Select Cloud &amp; Safety Plan</span>
            </div>
            <Badge variant="success">
              <ShieldCheck className="h-3 w-3" />
              <span>Core Always Free Forever</span>
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.keys(TIER_CATALOG) as SubscriptionTier[]).map((tierKey) => {
              const meta = TIER_CATALOG[tierKey];
              const price = storeConfig.tierPrices[tierKey] ?? meta.annualInr;
              const selected = selectedTier === tierKey;
              return (
                <button
                  key={tierKey}
                  type="button"
                  onClick={() => setSelectedTier(tierKey)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors cursor-pointer flex flex-col justify-between space-y-1.5',
                    selected
                      ? 'border-primary bg-primary-soft/60 ring-1 ring-primary/30'
                      : 'border-border bg-surface-elevated hover:border-border-strong'
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-foreground">{meta.displayName}</span>
                    {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                  <div className="font-mono text-sm font-bold text-primary tabular-nums">
                    {price === 0 ? '₹0 Forever' : `₹${price.toLocaleString('en-IN')}/yr`}
                  </div>
                  <p className="text-[10px] text-foreground-muted line-clamp-2">{meta.summary}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Quote Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border-strong bg-[var(--dd-surface-0)]/96 backdrop-blur-md px-3 sm:px-6 py-2.5 shadow-2xl">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary border border-primary-border shrink-0">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground tabular-nums">
                {totalUnits} Module{totalUnits === 1 ? '' : 's'} ·{' '}
                <span className="text-primary font-mono text-sm">
                  ₹{grandTotalInr.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="text-[10px] font-mono text-foreground-muted truncate">
                HW ₹{hardwareSubtotalInr.toLocaleString('en-IN')}
                {includeInstallation && ` + Install ₹${installationTotalInr.toLocaleString('en-IN')}`}
                {includeDfy3d && ` + 3D ₹${dfy3dTotalInr.toLocaleString('en-IN')}`}
                {subscriptionTotalInr > 0 && ` + ${TIER_CATALOG[selectedTier].displayName}`}
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            touchTarget
            disabled={totalUnits === 0}
            onClick={() => {
              setSubmittedQuote(null);
              setQuoteSheetOpen(true);
            }}
          >
            <MessageCircle className="h-4 w-4" />
            <span>Request Quote on WhatsApp</span>
          </Button>
        </div>
      </div>

      {/* WhatsApp Quote Sheet Modal */}
      {quoteSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setQuoteSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-quote-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto dd-scroll rounded-t-2xl sm:rounded-2xl border border-border-strong bg-surface p-4 sm:p-5 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 id="whatsapp-quote-title" className="text-sm font-semibold text-foreground">
                  Request Itemized Quote on WhatsApp
                </h2>
                <p className="text-[11px] text-foreground-muted mt-0.5">
                  Saves quote reference in DD oodle CRM and opens prefilled WhatsApp message.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close quote modal"
                onClick={() => setQuoteSheetOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {submittedQuote ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-success/40 bg-success-soft p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Quote {submittedQuote.quote.quote_ref} Recorded!</span>
                  </div>
                  <p className="text-[11px] text-foreground-secondary">
                    If WhatsApp did not open automatically, tap the direct launch button below.
                  </p>
                </div>

                <pre className="rounded-xl border border-border bg-canvas p-3 font-mono text-[10px] text-foreground-secondary whitespace-pre-wrap max-h-48 overflow-y-auto dd-scroll">
                  {buildWhatsAppQuoteText(submittedQuote.quote)}
                </pre>

                <div className="flex gap-2">
                  <a
                    href={submittedQuote.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1"
                  >
                    <Button variant="primary" className="w-full" touchTarget>
                      <MessageCircle className="h-4 w-4" />
                      <span>Open WhatsApp ({storeConfig.whatsappSalesNumber})</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button variant="secondary" onClick={() => setQuoteSheetOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="font-medium text-foreground-secondary">Your Name *</span>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 text-foreground"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-foreground-secondary">WhatsApp Phone *</span>
                    <input
                      type="tel"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="+919862000000"
                      className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 font-mono text-foreground"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="font-medium text-foreground-secondary">City / Locality *</span>
                    <input
                      type="text"
                      value={buyerCity}
                      onChange={(e) => setBuyerCity(e.target.value)}
                      placeholder="Imphal / Guwahati / Bengaluru"
                      className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 text-foreground"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="font-medium text-foreground-secondary block">Home Type</span>
                    <ThemedSelect
                      ariaLabel="Select home type"
                      value={homeType}
                      onChange={(v) => setHomeType(v as QuoteHomeType)}
                      options={HOME_TYPE_OPTIONS}
                    />
                  </div>
                </div>

                <label className="block space-y-1">
                  <span className="font-medium text-foreground-secondary">
                    Optional Notes (e.g., Tank height, car model, geyser wattage)
                  </span>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Switchboard sizes, inverter rooms, or delivery preference..."
                    className="w-full rounded-xl border border-border bg-surface-elevated p-2.5 text-foreground"
                  />
                </label>

                <div className="rounded-xl border border-border bg-surface-elevated p-3 space-y-1.5 font-mono text-[11px] tabular-nums">
                  <div className="flex justify-between text-foreground-secondary">
                    <span>Hardware ({totalUnits} modules)</span>
                    <span>₹{hardwareSubtotalInr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-foreground-secondary">
                    <span>Installation ({includeInstallation ? 'DD oodle Setup' : 'DIY'})</span>
                    <span>₹{installationTotalInr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-foreground-secondary">
                    <span>DFY 3D Home Twin</span>
                    <span>₹{dfy3dTotalInr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-foreground-secondary">
                    <span>Plan ({TIER_CATALOG[selectedTier].displayName})</span>
                    <span>₹{subscriptionTotalInr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-border font-bold text-foreground text-xs">
                    <span>Estimated Total</span>
                    <span className="text-primary">₹{grandTotalInr.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  touchTarget
                  disabled={submitting}
                  onClick={() => void handleSubmitQuote()}
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{submitting ? 'Generating Quote...' : 'Save Lead & Open WhatsApp Quote'}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <ShopWorkspace />
    </Suspense>
  );
}
