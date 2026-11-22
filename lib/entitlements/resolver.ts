/**
 * DD oodle Smart Home — Central Entitlement Resolver (v1.2)
 *
 * Non-Negotiable Product Invariants:
 * 1. Core (Free Forever) Anti-Bricking Floor is NEVER blocked by an expired subscription:
 *    - 4-Tier Fail-Safe control
 *    - 2D Room Grid
 *    - Up to 5 local schedules (.../rules)
 *    - 24h logs
 *    - Standard FCM push notifications
 *    - All hardware safety cutoffs (WAT-01 dry-run, PWR-03 max-runtime)
 * 2. Automatic 90-day Plus trial countdown for new homes.
 * 3. Supports Core, Plus, Drive, Shield, All-In Family + ₹999 One-Time DFY 3D Twin Add-On.
 */

import {
  HomeSubscriptionDoc,
  SAFETY_CONSTANTS,
  SubscriptionStatus,
  SubscriptionTier,
} from '../protocol/contract';

export interface TierPricingMeta {
  tier: SubscriptionTier;
  displayName: string;
  annualInr: number;
  monthlyInr: number;
  trialDays: number;
  summary: string;
}

export const TIER_CATALOG: Record<SubscriptionTier, TierPricingMeta> = {
  core: {
    tier: 'core',
    displayName: 'Core',
    annualInr: 0,
    monthlyInr: 0,
    trialDays: 0,
    summary:
      'Free Forever: 4-Tier Fail-Safe control, 2D Room Grid, 5 local schedules, 24h logs, standard push, and all hardware safety cutoffs.',
  },
  plus: {
    tier: 'plus',
    displayName: 'Plus',
    annualInr: 1499,
    monthlyInr: 149,
    trialDays: 90,
    summary:
      '3D Home View, Pro Logic Automations, Voice C2C (Google Home / Alexa / Siri Shortcuts), WhatsApp alerts, and 90-day analytics.',
  },
  drive: {
    tier: 'drive',
    displayName: 'Drive',
    annualInr: 1499,
    monthlyInr: 149,
    trialDays: 0,
    summary:
      'VEH-01 4G M2M SIM renewal tracking, Crash SOS SMS/WhatsApp/Voice Call escalation, full trip logs & geofences (Yr-2+).',
  },
  shield: {
    tier: 'shield',
    displayName: 'Shield',
    annualInr: 2499,
    monthlyInr: 249,
    trialDays: 0,
    summary: 'All Plus features + annual AMC checkup scheduling + 24h swap priority SLA.',
  },
  all_in_family: {
    tier: 'all_in_family',
    displayName: 'All-In Family',
    annualInr: 3499,
    monthlyInr: 349,
    trialDays: 0,
    summary: 'All Shield features + 1 Drive vehicle + Car-to-Home geofence automations.',
  },
};

export const DFY_3D_TWIN_ADDON_INR = 999;
export const PLUS_TRIAL_DAYS = 90;

export type RenewalReminderWindow = 'NONE' | 'D-30' | 'D-7' | 'D-1' | 'EXPIRED';

export interface ResolvedEntitlements {
  /** Effective tier after trial / expiry evaluation */
  effectiveTier: SubscriptionTier;
  /** Raw stored tier from homes/{home_id}/subscription */
  storedTier: SubscriptionTier;
  status: SubscriptionStatus;
  /** True when a previously paid or trial plan expired and cleanly degraded to Core */
  degradedToCore: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  daysUntilExpiry: number | null;
  renewalReminderWindow: RenewalReminderWindow;

  // --- Hard Anti-Bricking Floor (Core — ALWAYS TRUE, NEVER LOCKED) ---
  coreFloor: {
    readonly fourTierFailSafeControl: true;
    readonly twoDRoomGrid: true;
    readonly standardFcmPush: true;
    readonly hardwareSafetyCutoffs: true;
  };

  // --- Feature Flags & Quotas ---
  maxLocalSchedules: number;
  logRetentionDays: number;
  canUse3DHomeView: boolean;
  hasDfy3dTwin: boolean;
  canUseProLogicAutomations: boolean;
  canUseVoiceC2C: boolean;
  canUseWhatsAppAlerts: boolean;
  canUseDriveTelemetryAndTrips: boolean;
  canUseCrashSosEscalation: boolean;
  canUseCarToHomeGeofence: boolean;
  hasAnnualAmcCheckup: boolean;
  has24hSwapPriority: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function computeDaysRemaining(targetEpochMs: number | null, nowMs: number): number | null {
  if (targetEpochMs === null || !Number.isFinite(targetEpochMs)) {
    return null;
  }
  const diff = targetEpochMs - nowMs;
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

function resolveRenewalWindow(
  effectiveTier: SubscriptionTier,
  daysRemaining: number | null,
  degradedToCore: boolean
): RenewalReminderWindow {
  if (degradedToCore) return 'EXPIRED';
  if (effectiveTier === 'core' || daysRemaining === null) return 'NONE';
  if (daysRemaining <= 1) return 'D-1';
  if (daysRemaining <= 7) return 'D-7';
  if (daysRemaining <= 30) return 'D-30';
  return 'NONE';
}

/**
 * Pure, deterministic entitlement resolver shared across PWA UI, Next.js API routes,
 * Cloud Functions, and the Dev-Mode Simulator.
 */
export function resolveEntitlements(
  subscription: HomeSubscriptionDoc | null | undefined,
  nowMs: number = Date.now()
): ResolvedEntitlements {
  const safeSub: HomeSubscriptionDoc = subscription ?? {
    tier: 'core',
    status: 'active',
    trial_ends_at: null,
    expires_at: null,
    dfy_3d_purchased: false,
  };

  const trialDaysLeft = computeDaysRemaining(safeSub.trial_ends_at, nowMs);
  const expiryDaysLeft = computeDaysRemaining(safeSub.expires_at, nowMs);

  let effectiveTier: SubscriptionTier = 'core';
  let isTrialActive = false;
  let degradedToCore = false;

  if (safeSub.status === 'trial') {
    if (trialDaysLeft !== null && trialDaysLeft > 0) {
      effectiveTier = 'plus';
      isTrialActive = true;
    } else {
      effectiveTier = 'core';
      degradedToCore = true;
    }
  } else if (safeSub.status === 'active') {
    if (safeSub.tier === 'core') {
      effectiveTier = 'core';
    } else if (safeSub.expires_at === null || (expiryDaysLeft !== null && expiryDaysLeft > 0)) {
      effectiveTier = safeSub.tier;
    } else {
      // Paid plan passed expiry timestamp -> degrade smoothly to Core without bricking
      effectiveTier = 'core';
      degradedToCore = true;
    }
  } else {
    // 'expired' | 'cancelled' | 'past_due' -> degrade cleanly to Core
    effectiveTier = 'core';
    degradedToCore = safeSub.tier !== 'core' || safeSub.trial_ends_at !== null;
  }

  const hasPlusFeatures =
    effectiveTier === 'plus' ||
    effectiveTier === 'shield' ||
    effectiveTier === 'all_in_family';

  const hasDriveFeatures =
    effectiveTier === 'drive' || effectiveTier === 'all_in_family';

  const hasShieldFeatures =
    effectiveTier === 'shield' || effectiveTier === 'all_in_family';

  const hasAllInFeatures = effectiveTier === 'all_in_family';

  const activeCountdownDays = isTrialActive ? trialDaysLeft : expiryDaysLeft;

  return {
    effectiveTier,
    storedTier: safeSub.tier,
    status: degradedToCore ? 'expired' : safeSub.status,
    degradedToCore,
    isTrialActive,
    trialDaysRemaining: isTrialActive && trialDaysLeft !== null ? trialDaysLeft : 0,
    daysUntilExpiry: activeCountdownDays,
    renewalReminderWindow: resolveRenewalWindow(
      effectiveTier,
      activeCountdownDays,
      degradedToCore
    ),

    // Hard Anti-Bricking Floor: Always true regardless of billing state
    coreFloor: {
      fourTierFailSafeControl: true,
      twoDRoomGrid: true,
      standardFcmPush: true,
      hardwareSafetyCutoffs: true,
    },

    maxLocalSchedules: hasPlusFeatures ? 50 : SAFETY_CONSTANTS.CORE_MAX_LOCAL_SCHEDULES,
    logRetentionDays: hasPlusFeatures || hasDriveFeatures ? 90 : 1,
    canUse3DHomeView: hasPlusFeatures || Boolean(safeSub.dfy_3d_purchased),
    hasDfy3dTwin: Boolean(safeSub.dfy_3d_purchased),
    canUseProLogicAutomations: hasPlusFeatures,
    canUseVoiceC2C: hasPlusFeatures,
    canUseWhatsAppAlerts: hasPlusFeatures || hasDriveFeatures,
    canUseDriveTelemetryAndTrips: hasDriveFeatures,
    canUseCrashSosEscalation: hasDriveFeatures,
    canUseCarToHomeGeofence: hasAllInFeatures,
    hasAnnualAmcCheckup: hasShieldFeatures,
    has24hSwapPriority: hasShieldFeatures,
  };
}

/** Helper to initialize a new home with the automatic 90-day Plus trial */
export function createInitialHomeSubscription(nowMs: number = Date.now()): HomeSubscriptionDoc {
  return {
    tier: 'core',
    status: 'trial',
    trial_ends_at: nowMs + PLUS_TRIAL_DAYS * MS_PER_DAY,
    expires_at: null,
    dfy_3d_purchased: false,
  };
}

/** Gate check helper for local schedule rule additions respecting the Core 5-schedule floor */
export function canAddLocalSchedule(
  entitlements: ResolvedEntitlements,
  currentRuleCount: number
): { allowed: boolean; limit: number; reason?: string } {
  if (currentRuleCount < entitlements.maxLocalSchedules) {
    return { allowed: true, limit: entitlements.maxLocalSchedules };
  }
  return {
    allowed: false,
    limit: entitlements.maxLocalSchedules,
    reason: `Your ${TIER_CATALOG[entitlements.effectiveTier].displayName} plan supports up to ${entitlements.maxLocalSchedules} local schedules. Upgrade to Plus for unlimited Pro Logic automations.`,
  };
}
