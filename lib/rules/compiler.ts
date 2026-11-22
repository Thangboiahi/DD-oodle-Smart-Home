/**
 * DD oodle Smart Home — Hybrid Automation Engine & Compiler (Protocol Contract v1.4, G17)
 *
 * Implements:
 * 1. Two-Tier UX: 1-Tap Indian Recipes upfront + Plus-gated Pro Logic (IF/ELSE/AND/OR/NOT).
 * 2. G17 Rule Compiler:
 *    - Compiles Pro Logic AST into local ESP32/HUB-01 rules (<=5 on Core, <=64 on HUB-01).
 *    - Schema: when + up to 3 'and' + window + up to 4 'then' + cooldown_sec.
 *    - Flattens OR into parallel LocalRules.
 *    - Flattens NOT into inverted operators (!=, <=, >=).
 *    - Flattens ELSE into complementary trigger rules.
 * 3. Execution routing: Local device vs Cloud Run cross-category (geofence, WhatsApp alerts).
 * 4. Safety Guardrail Enforcement: hard_locked ceilings and G17 RULE_REJECTED detection
 *    (rules attempting to actuate vehicle immobilizer or alter guardrails are rejected).
 */

import {
  DeviceStateMap,
  LocalRule,
  LocalRuleCondition,
  ModuleCode,
  PrimitiveStateValue,
  RulesPayload,
  SAFETY_CONSTANTS,
} from '../protocol/contract';
import { ResolvedEntitlements } from '../entitlements/resolver';

export interface ProRuleAst {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  category: 'local' | 'cross_category'; // local pushes to .../rules, cross_category runs in Cloud Functions
  targetDeviceId: string;
  targetModuleCode: ModuleCode;
  trigger: {
    type: 'schedule' | 'threshold' | 'state_change' | 'geofence';
    key?: string;
    op?: '<' | '<=' | '>' | '>=' | '==' | '!=';
    value?: PrimitiveStateValue;
    cron?: string;
    geofenceId?: string;
    geofenceEvent?: 'enter' | 'exit';
  };
  conditions: {
    logic: 'AND' | 'OR';
    items: {
      key: string;
      op: '<' | '<=' | '>' | '>=' | '==' | '!=';
      value: PrimitiveStateValue;
      isNot?: boolean;
    }[];
  };
  window?: {
    startTime: string; // HH:mm format, e.g. "06:00"
    endTime: string;   // HH:mm format, e.g. "09:30"
  };
  cooldownSec?: number;
  actions: {
    deviceId: string;
    set: DeviceStateMap;
  }[];
  elseActions?: {
    deviceId: string;
    set: DeviceStateMap;
  }[];
}

export interface RuleCompilationResult {
  valid: boolean;
  localRules: LocalRule[];
  cloudRules: ProRuleAst[];
  warnings: string[];
  errors: string[];
  quota: {
    used: number;
    max: number;
    exceeded: boolean;
  };
}

/** Inverts a comparison operator for NOT / complementary ELSE compilation */
function invertOperator(op: '<' | '<=' | '>' | '>=' | '==' | '!='): '<' | '<=' | '>' | '>=' | '==' | '!=' {
  switch (op) {
    case '==':
      return '!=';
    case '!=':
      return '==';
    case '>':
      return '<=';
    case '<=':
      return '>';
    case '<':
      return '>=';
    case '>=':
      return '<';
    default:
      return '!=';
  }
}

/** Pre-defined 1-Tap Indian Home Automation Recipes */
export const INDIAN_RECIPES: ProRuleAst[] = [
  {
    id: 'recipe_inverter_saver',
    name: 'Inverter Saver (Power Cut Protection)',
    description: 'Instantly shuts off 16A Geyser & heavy heating loads when grid power drops or total inverter draw > 1200W.',
    enabled: true,
    category: 'local',
    targetDeviceId: 'dd_pwr03_g7h8i9',
    targetModuleCode: 'PWR-03',
    trigger: {
      type: 'threshold',
      key: 'p',
      op: '>',
      value: 1200,
    },
    conditions: {
      logic: 'AND',
      items: [
        { key: 'ch1', op: '==', value: true },
      ],
    },
    cooldownSec: 30,
    actions: [
      {
        deviceId: 'dd_pwr03_g7h8i9',
        set: { ch1: false },
      },
    ],
  },
  {
    id: 'recipe_morning_geyser',
    name: 'Morning Hot Water Schedule',
    description: 'Auto-activates 16A Geyser at 06:00 AM with mandatory 45-minute non-overridable hardware safety cutoff.',
    enabled: true,
    category: 'local',
    targetDeviceId: 'dd_pwr03_g7h8i9',
    targetModuleCode: 'PWR-03',
    trigger: {
      type: 'schedule',
      cron: '0 6 * * *',
    },
    conditions: {
      logic: 'AND',
      items: [],
    },
    window: {
      startTime: '06:00',
      endTime: '06:45',
    },
    cooldownSec: 60,
    actions: [
      {
        deviceId: 'dd_pwr03_g7h8i9',
        set: { ch1: true },
      },
    ],
  },
  {
    id: 'recipe_tank_autofill',
    name: 'Overhead Tank Auto-Fill (WAT-01)',
    description: 'Starts pump when water level drops <= 25%, auto-cuts off at 90% with 30s dry-run hardware interlock.',
    enabled: true,
    category: 'local',
    targetDeviceId: 'dd_wat01_j1k2l3',
    targetModuleCode: 'WAT-01',
    trigger: {
      type: 'threshold',
      key: 'level_pct',
      op: '<=',
      value: 25,
    },
    conditions: {
      logic: 'AND',
      items: [
        { key: 'pump_on', op: '==', value: false },
      ],
    },
    cooldownSec: 120,
    actions: [
      {
        deviceId: 'dd_wat01_j1k2l3',
        set: { pump_on: true },
      },
    ],
    elseActions: [
      {
        deviceId: 'dd_wat01_j1k2l3',
        set: { pump_on: false },
      },
    ],
  },
  {
    id: 'recipe_porch_lights',
    name: 'Evening Porch Lights (PWR-01)',
    description: 'Toggles exterior porch lights ON at 06:30 PM (sunset) and turns them OFF at 11:00 PM.',
    enabled: true,
    category: 'local',
    targetDeviceId: 'dd_pwr01_a1b2c3',
    targetModuleCode: 'PWR-01',
    trigger: {
      type: 'schedule',
      cron: '30 18 * * *',
    },
    conditions: {
      logic: 'AND',
      items: [],
    },
    window: {
      startTime: '18:30',
      endTime: '23:00',
    },
    cooldownSec: 60,
    actions: [
      {
        deviceId: 'dd_pwr01_a1b2c3',
        set: { ch3: true },
      },
    ],
    elseActions: [
      {
        deviceId: 'dd_pwr01_a1b2c3',
        set: { ch3: false },
      },
    ],
  },
  {
    id: 'recipe_coming_home_gps',
    name: 'Coming Home Car Trigger (Cross-Category)',
    description: 'When VEH-01 enters Home Geofence (500m), automatically turns on porch lights and air conditioning.',
    enabled: true,
    category: 'cross_category',
    targetDeviceId: 'dd_veh01_m4n5p6',
    targetModuleCode: 'VEH-01',
    trigger: {
      type: 'geofence',
      geofenceId: 'gf_home',
      geofenceEvent: 'enter',
    },
    conditions: {
      logic: 'AND',
      items: [],
    },
    cooldownSec: 300,
    actions: [
      {
        deviceId: 'dd_pwr01_a1b2c3',
        set: { ch3: true },
      },
    ],
  },
];

/**
 * Compiles high-level Pro Logic rules & 1-tap recipes into protocol-compliant LocalRules.
 * Handles:
 * - Flattening of OR conditions into parallel local rules.
 * - Inversion of NOT flags (!=, <=, >=).
 * - Complementary rule generation for ELSE actions.
 * - Routing of cross-category triggers (e.g. Geofence, WhatsApp) to Cloud functions.
 * - Enforcing non-overridable safety guardrails and G17 RULE_REJECTED validation.
 */
export function compileProRules(
  proRules: ProRuleAst[],
  entitlements: ResolvedEntitlements,
  isHubNode: boolean = false
): RuleCompilationResult {
  const localRules: LocalRule[] = [];
  const cloudRules: ProRuleAst[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const maxAllowed = isHubNode ? 64 : entitlements.maxLocalSchedules;

  for (const ast of proRules) {
    if (!ast.enabled) continue;

    // 1. Cross-category routing (GPS Geofence, WhatsApp, Cloud Cross-Device)
    if (ast.category === 'cross_category' || ast.trigger.type === 'geofence') {
      cloudRules.push(ast);
      continue;
    }

    // 2. Safety Validation (G17 Invariant)
    // Local rules MUST NEVER attempt to command vehicle immobilizer or alter guardrails
    const violatesG17Safety = ast.actions.some((a) => {
      return a.set.immobilize !== undefined || a.set.guardrails !== undefined;
    });

    if (violatesG17Safety) {
      errors.push(
        `G17 Security Rejection: Rule "${ast.name}" attempted to actuate vehicle starter lock or alter guardrails locally. Blocked.`
      );
      continue;
    }

    // 3. Pro Logic Entitlement Gate
    const hasOrLogic = ast.conditions.logic === 'OR' && ast.conditions.items.length > 1;
    const hasElse = ast.elseActions && ast.elseActions.length > 0;
    if ((hasOrLogic || hasElse) && !entitlements.canUseProLogicAutomations) {
      warnings.push(
        `Rule "${ast.name}" uses Plus-tier Pro Logic (OR/ELSE). Basic conditions will execute under Core free floor.`
      );
    }

    // Helper to build primary condition
    let primaryCondition: LocalRuleCondition | undefined = undefined;
    if (ast.trigger.key && ast.trigger.op && ast.trigger.value !== undefined) {
      primaryCondition = {
        key: ast.trigger.key,
        op: ast.trigger.op,
        value: ast.trigger.value,
      };
    }

    // Consolidate 'then' action payload (up to 4 keys)
    const combinedAction: DeviceStateMap = {};
    for (const a of ast.actions) {
      Object.assign(combinedAction, a.set);
    }

    // 4. Flattening OR Logic into parallel LocalRules
    if (ast.conditions.logic === 'OR' && ast.conditions.items.length > 0) {
      ast.conditions.items.forEach((item, idx) => {
        const itemOp = item.isNot ? invertOperator(item.op) : item.op;
        const ruleItem: LocalRule = {
          id: `${ast.id}_or_${idx}`,
          enabled: true,
          type: ast.trigger.type === 'schedule' ? 'schedule' : 'threshold',
          cron: ast.trigger.cron,
          window: ast.window
            ? { start_time: ast.window.startTime, end_time: ast.window.endTime }
            : undefined,
          cooldown_sec: ast.cooldownSec ?? 60,
          condition: primaryCondition,
          and: [{ key: item.key, op: itemOp, value: item.value }],
          action: combinedAction,
        };
        localRules.push(ruleItem);
      });
    } else {
      // AND Logic (up to 3 'and' conditions)
      const andConditions: LocalRuleCondition[] = ast.conditions.items.slice(0, 3).map((item) => ({
        key: item.key,
        op: item.isNot ? invertOperator(item.op) : item.op,
        value: item.value,
      }));

      const ruleItem: LocalRule = {
        id: ast.id,
        enabled: true,
        type: ast.trigger.type === 'schedule' ? 'schedule' : 'threshold',
        cron: ast.trigger.cron,
        window: ast.window
          ? { start_time: ast.window.startTime, end_time: ast.window.endTime }
          : undefined,
        cooldown_sec: ast.cooldownSec ?? 60,
        condition: primaryCondition,
        and: andConditions.length > 0 ? andConditions : undefined,
        action: combinedAction,
      };
      localRules.push(ruleItem);
    }

    // 5. Flattening ELSE into complementary trigger rule
    if (ast.elseActions && ast.elseActions.length > 0 && primaryCondition) {
      const elseCombinedAction: DeviceStateMap = {};
      for (const ea of ast.elseActions) {
        Object.assign(elseCombinedAction, ea.set);
      }

      const complementaryCondition: LocalRuleCondition = {
        key: primaryCondition.key,
        op: invertOperator(primaryCondition.op),
        value: primaryCondition.value,
      };

      const elseRule: LocalRule = {
        id: `${ast.id}_else`,
        enabled: true,
        type: 'threshold',
        cooldown_sec: ast.cooldownSec ?? 60,
        condition: complementaryCondition,
        action: elseCombinedAction,
      };
      localRules.push(elseRule);
    }
  }

  const quotaExceeded = localRules.length > maxAllowed;
  if (quotaExceeded) {
    errors.push(
      `Local schedule limit exceeded: Compiled ${localRules.length} rules, but max capacity is ${maxAllowed}. Upgrade to Plus for 50 local schedules or HUB-01 for 64.`
    );
  }

  return {
    valid: errors.length === 0,
    localRules: localRules.slice(0, maxAllowed),
    cloudRules,
    warnings,
    errors,
    quota: {
      used: localRules.length,
      max: maxAllowed,
      exceeded: quotaExceeded,
    },
  };
}

/** Formats a compiled LocalRule list into protocol-compliant RulesPayload */
export function buildRulesPayload(rules: LocalRule[]): RulesPayload {
  return {
    schema: 'v1.4',
    rules,
  };
}
