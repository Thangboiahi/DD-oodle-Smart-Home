'use client';

/**
 * DD oodle Smart Home — Storefront Quote & WhatsApp Lead Funnel Service
 * Syncs shop quote leads to Firestore `quotes/{quote_id}` and local ERP mirror.
 */

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { SubscriptionTier } from '@/lib/protocol/contract';
import { TIER_CATALOG } from '@/lib/entitlements/resolver';

export type QuoteStatus = 'NEW' | 'CONTACTED' | 'APPROVED' | 'CONVERTED' | 'ARCHIVED';
export type QuoteHomeType = '1BHK' | '2BHK' | '3BHK' | 'Duplex' | 'Commercial';

export interface QuoteLineItem {
  module_code: string;
  name: string;
  qty: number;
  unitRetailInr: number;
  unitInstallInr: number;
  unitBomInr: number;
}

export interface QuoteRecord {
  quote_id: string;
  quote_ref: string;
  buyerName: string;
  buyerPhone: string;
  city: string;
  homeType: QuoteHomeType;
  notes: string;
  includeInstallation: boolean;
  includeDfy3d: boolean;
  subscriptionTier: SubscriptionTier;
  items: QuoteLineItem[];
  hardwareSubtotalInr: number;
  installationTotalInr: number;
  dfy3dTotalInr: number;
  subscriptionTotalInr: number;
  grandTotalInr: number;
  status: QuoteStatus;
  homeId?: string;
  assignedInstallerUid?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export const QUOTES_STORAGE_KEY = 'dd_oodle_quotes_v1';
export const QUOTES_SYNC_EVENT = 'ddoodle:quotes-sync';

export const DEFAULT_DEMO_QUOTES: QuoteRecord[] = [
  {
    quote_id: 'dd_q_2611_a101',
    quote_ref: 'DD-Q-2611-A101',
    buyerName: 'Rohan Ningthoujam',
    buyerPhone: '+919862044112',
    city: 'Imphal West (Lamphel)',
    homeType: '3BHK',
    notes: 'Include overhead water tank wiring + 2 geyser controllers.',
    includeInstallation: true,
    includeDfy3d: true,
    subscriptionTier: 'all_in_family',
    items: [
      { module_code: 'PWR-01', name: '4-Channel Smart Switchboard + Fan/Dimmer', qty: 3, unitRetailInr: 1999, unitInstallInr: 399, unitBomInr: 848 },
      { module_code: 'PWR-02', name: 'Hum-Free Stepped Ceiling Fan & Dimmer Node', qty: 2, unitRetailInr: 2199, unitInstallInr: 399, unitBomInr: 889 },
      { module_code: 'PWR-03', name: '16A / 25A Heavy Appliance & Geyser Guard', qty: 2, unitRetailInr: 2499, unitInstallInr: 299, unitBomInr: 1091 },
      { module_code: 'WAT-01', name: 'Overhead Tank & Submersible Pump Dry-Run Guard', qty: 1, unitRetailInr: 7999, unitInstallInr: 999, unitBomInr: 4134 },
      { module_code: 'HUB-01', name: 'Local Offline Edge Hub (MQTT + 64 Rules)', qty: 1, unitRetailInr: 3499, unitInstallInr: 499, unitBomInr: 1246 },
    ],
    hardwareSubtotalInr: 26891,
    installationTotalInr: 4091,
    dfy3dTotalInr: 999,
    subscriptionTotalInr: 3499,
    grandTotalInr: 35480,
    status: 'APPROVED',
    createdAtMs: 1764042000000,
    updatedAtMs: 1764045000000,
  },
  {
    quote_id: 'dd_q_2611_b208',
    quote_ref: 'DD-Q-2611-B208',
    buyerName: 'Ananya Boruah',
    buyerPhone: '+919435088219',
    city: 'Guwahati (Zoo Road)',
    homeType: '2BHK',
    notes: 'Pre-booking smart door lock alongside Car VEH-01.',
    includeInstallation: true,
    includeDfy3d: false,
    subscriptionTier: 'plus',
    items: [
      { module_code: 'PWR-01', name: '4-Channel Smart Switchboard + Fan/Dimmer', qty: 2, unitRetailInr: 1999, unitInstallInr: 399, unitBomInr: 848 },
      { module_code: 'VEH-01', name: '4G GPS Car Security, Crash SOS & Immobilizer', qty: 1, unitRetailInr: 7999, unitInstallInr: 799, unitBomInr: 4227 },
    ],
    hardwareSubtotalInr: 11997,
    installationTotalInr: 1597,
    dfy3dTotalInr: 0,
    subscriptionTotalInr: 1499,
    grandTotalInr: 15093,
    status: 'NEW',
    createdAtMs: 1764060000000,
    updatedAtMs: 1764060000000,
  },
];

export function readStoredQuotes(): QuoteRecord[] {
  if (typeof window === 'undefined') return DEFAULT_DEMO_QUOTES;
  try {
    const raw = window.localStorage.getItem(QUOTES_STORAGE_KEY);
    if (!raw) return DEFAULT_DEMO_QUOTES;
    const parsed = JSON.parse(raw) as QuoteRecord[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_DEMO_QUOTES;
  } catch {
    return DEFAULT_DEMO_QUOTES;
  }
}

export function writeStoredQuotes(quotes: QuoteRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes));
    window.dispatchEvent(new CustomEvent(QUOTES_SYNC_EVENT));
  } catch {
    // Ignore storage errors
  }
}

export function generateQuoteIdentifiers(now: Date = new Date()): {
  quote_id: string;
  quote_ref: string;
} {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
  return {
    quote_id: `dd_q_${yy}${mm}_${suffix.toLowerCase()}`,
    quote_ref: `DD-Q-${yy}${mm}-${suffix}`,
  };
}

export function buildWhatsAppQuoteText(quote: QuoteRecord): string {
  const lines = [
    `*DD oodle Smart Home — Quote Request*`,
    `Ref: ${quote.quote_ref}`,
    ``,
    `*Customer Details*`,
    `Name: ${quote.buyerName}`,
    `Phone: ${quote.buyerPhone}`,
    `City/Area: ${quote.city}`,
    `Home Type: ${quote.homeType}`,
    ``,
    `*Selected Modules (${quote.items.reduce((s, i) => s + i.qty, 0)} units)*`,
    ...quote.items.map(
      (i) =>
        `• ${i.module_code} × ${i.qty} — ₹${(i.unitRetailInr * i.qty).toLocaleString('en-IN')}`
    ),
    ``,
    `*Services & Plan*`,
    `Installation: ${
      quote.includeInstallation
        ? `DD oodle Local Setup (+₹${quote.installationTotalInr.toLocaleString('en-IN')})`
        : 'Hardware Only (₹0)'
    }`,
    `DFY 3D Home Twin: ${
      quote.includeDfy3d
        ? `Included (+₹${quote.dfy3dTotalInr.toLocaleString('en-IN')})`
        : 'No'
    }`,
    `Plan: ${TIER_CATALOG[quote.subscriptionTier].displayName} (${
      quote.subscriptionTotalInr === 0
        ? 'Free Forever'
        : `₹${quote.subscriptionTotalInr.toLocaleString('en-IN')}/yr`
    })`,
    ``,
    `*Estimated Total: ₹${quote.grandTotalInr.toLocaleString('en-IN')}*`,
  ];

  if (quote.notes.trim()) {
    lines.push('', `Notes: ${quote.notes.trim()}`);
  }
  return lines.join('\n');
}

export function buildWhatsAppQuoteUrl(
  adminWhatsappNumber: string,
  quote: QuoteRecord
): string {
  const cleanDigits = adminWhatsappNumber.replace(/\D/g, '') || '919862011114';
  const text = encodeURIComponent(buildWhatsAppQuoteText(quote));
  return `https://wa.me/${cleanDigits}?text=${text}`;
}

export async function submitQuoteLead(
  quote: QuoteRecord,
  adminWhatsappNumber: string
): Promise<{ ok: boolean; whatsappUrl: string; syncedCloud: boolean }> {
  const current = readStoredQuotes();
  writeStoredQuotes([quote, ...current.filter((q) => q.quote_id !== quote.quote_id)]);

  let syncedCloud = false;
  try {
    await setDoc(doc(db, 'quotes', quote.quote_id), {
      quote_ref: quote.quote_ref,
      name: quote.buyerName,
      phone: quote.buyerPhone,
      city: quote.city,
      home_type: quote.homeType,
      items: quote.items.map((item) => ({
        module_code: item.module_code,
        name: item.name,
        qty: item.qty,
        unit_retail_inr: item.unitRetailInr,
        unit_install_inr: item.unitInstallInr,
      })),
      notes: quote.notes,
      status: 'NEW',
      tier: quote.subscriptionTier,
      include_dfy_3d: quote.includeDfy3d,
      include_install: quote.includeInstallation,
      hardware_inr: quote.hardwareSubtotalInr,
      install_inr: quote.installationTotalInr,
      dfy_3d_inr: quote.dfy3dTotalInr,
      subscription_inr: quote.subscriptionTotalInr,
      total_inr: quote.grandTotalInr,
      source: 'web_shop',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    syncedCloud = true;
  } catch {
    // Public fallback writes cleanly to local ERP store when Firestore write is unavailable offline
  }

  return {
    ok: true,
    whatsappUrl: buildWhatsAppQuoteUrl(adminWhatsappNumber, quote),
    syncedCloud,
  };
}
