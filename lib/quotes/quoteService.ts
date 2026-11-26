'use client';

/**
 * DD oodle Smart Home — Quote Persistence & WhatsApp Deep-Link Generator
 *
 * Routed directly through the Phase 13B Unified Full-Stack Data Spine (`lib/data/unifiedStore.ts`).
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { TIER_CATALOG } from '../entitlements/resolver';
import {
  getUnifiedWorkspaceState,
  mutateUnifiedWorkspace,
} from '../data/unifiedStore';
import type {
  QuoteHomeType,
  QuoteLineItem,
  QuoteRecord,
  QuoteStatus,
} from '../data/canonicalSeed';

export type {
  QuoteHomeType,
  QuoteLineItem,
  QuoteRecord,
  QuoteStatus,
};

export function generateQuoteIdentifiers(): { quote_id: string; quote_ref: string } {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return {
    quote_id: `qt_${datePart}_${rand}`,
    quote_ref: `DD-${datePart}-${rand}`,
  };
}

export function buildWhatsAppQuoteText(quote: QuoteRecord): string {
  const tierName = TIER_CATALOG[quote.subscriptionTier]?.displayName ?? quote.subscriptionTier;
  const lines: string[] = [
    `*DD oodle Smart Home — Itemized Quote (${quote.quote_ref})*`,
    `Customer: ${quote.buyerName}`,
    `Phone: ${quote.buyerPhone}`,
    `City: ${quote.city} (${quote.homeType})`,
    '',
    '*Selected Hardware Modules:*',
    ...quote.items.map(
      (i) =>
        `• ${i.qty}x ${i.module_code} (${i.name}) — ₹${(i.unitRetailInr * i.qty).toLocaleString('en-IN')}`
    ),
  ];

  if (quote.includeInstallation && quote.installationTotalInr > 0) {
    lines.push(
      `• Local Field Installation & G10 Safety Testing — ₹${quote.installationTotalInr.toLocaleString('en-IN')}`
    );
  }
  if (quote.includeDfy3d && quote.dfy3dTotalInr > 0) {
    lines.push(
      `• ₹${quote.dfy3dTotalInr.toLocaleString('en-IN')} Done-For-You 3D Architectural Home Twin Setup`
    );
  }
  lines.push(
    `• Plan Tier: ${tierName} — ₹${quote.subscriptionTotalInr.toLocaleString('en-IN')}/yr`
  );
  lines.push('');
  lines.push(`*Grand Total Estimate: ₹${quote.grandTotalInr.toLocaleString('en-IN')}*`);
  lines.push('Includes Core Tier Free Forever (Zero Bricking Guarantee).');
  if (quote.notes) {
    lines.push(`Notes: ${quote.notes}`);
  }
  return lines.join('\n');
}

export function buildWhatsAppQuoteUrl(whatsappNumber: string, quote: QuoteRecord): string {
  const cleanNumber = whatsappNumber.replace(/\D/g, '') || '919862011114';
  const text = buildWhatsAppQuoteText(quote);
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text)}`;
}

export function loadSavedQuotes(): QuoteRecord[] {
  return getUnifiedWorkspaceState().quotes;
}

export async function submitQuoteLead(
  quote: QuoteRecord,
  whatsappNumber: string
): Promise<{ whatsappUrl: string; syncedCloud: boolean }> {
  mutateUnifiedWorkspace((prev) => ({
    ...prev,
    quotes: [quote, ...prev.quotes],
  }));

  let syncedCloud = false;
  try {
    if (db) {
      await setDoc(doc(db, 'quotes', quote.quote_id), quote, { merge: true });
      syncedCloud = true;
    }
  } catch {
    syncedCloud = false;
  }

  return {
    whatsappUrl: buildWhatsAppQuoteUrl(whatsappNumber, quote),
    syncedCloud,
  };
}
