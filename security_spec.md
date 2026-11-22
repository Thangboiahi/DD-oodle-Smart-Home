# DD oodle Smart Home — Security Specification & Threat Model (Phase 0 TDD)

## 1. Core Data Invariants
1. **PII Isolation (`users/{uid}`)**: Phone numbers, names, and `emergency_contacts[]` are strictly readable and writable ONLY by `request.auth.uid == uid` or verified Admins. Zero blanket `isSignedIn()` reads.
2. **No Role Self-Escalation**: Users creating `users/{uid}` MUST have `role == 'customer'`. Non-admins can NEVER modify `role` or write to `admins/{uid}`.
3. **Subscription Tamper Resistance (`homes/{home_id}`)**: Regular home owners cannot upgrade `subscription.tier`, extend `expires_at`, or set `dfy_3d_purchased: true` via client SDK. New homes start strictly with `tier: 'core'` and `status: 'trial'` (or `'active'`).
4. **Master Gate Relational Sync**: Every subcollection under `homes/{home_id}` (`rooms`, `devices`, `automations`) executes a live `get()` against parent `homes/{home_id}`. Removing a user from `homes/{home_id}.members` revokes all sub-resource access synchronously.
5. **Hard-Locked Safety Guardrails (`homes/{home_id}/devices/{device_id}`)**: Once `guardrails.hard_locked == true` (e.g., `WAT-01` dry-run, `PWR-03` max-runtime), non-admin updates CANNOT set `hard_locked: false` or exceed ceiling limits (`max_runtime_min <= 90`, `dry_run_timeout_sec <= 60`).
6. **Life-Safety Terminal State Locking (`incidents/{incident_id}`)**: Once an incident enters `cancelled_by_user` or `resolved`, non-admin clients cannot reopen or mutate it. Home members can ONLY transition `countdown -> cancelled_by_user` during the 20s cancel window.
7. **24h Swap Priority SLA Verification (`amc_tickets/{ticket_id}`)**: A client creating an AMC ticket can only set `priority_24h: true` if their parent home's active subscription is `shield` or `all_in_family`.
8. **RTDB Live Mirror Integrity (`/live/$home_id/$device_id`)**: Clients have read-only access to `/live` gated by `/home_members/$home_id/$uid`. Device state/telemetry writes come exclusively from the server-side Cloud Run MQTT Bridge. Client commands go through validated `/cmd_queue/$home_id/$device_id/$req_id` where `family` role cannot trigger `immobilized: true`.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return `PERMISSION_DENIED`)
1. **Self-Assigned Admin Role**: `POST users/attacker_uid` with `{ "role": "admin", ... }` -> DENIED (`role` must be `'customer'`).
2. **PII Cross-User Scrape**: `GET users/victim_uid` as `attacker_uid` -> DENIED (owner/admin only).
3. **Free Subscription Self-Upgrade**: `PATCH homes/home_1` by home owner setting `{ "subscription": { "tier": "all_in_family", "status": "active", "dfy_3d_purchased": true } }` -> DENIED (`subscription` not in owner allowed update keys).
4. **Hard-Locked Guardrail Unlock (`PWR-03` / `WAT-01`)**: `PATCH homes/home_1/devices/dd_wat01` by owner setting `{ "guardrails": { "hard_locked": false, "dry_run_timeout_sec": 9999 } }` -> DENIED.
5. **Shadow Field Injection**: `PATCH homes/home_1/rooms/room_living` adding ghost key `{ "isVerified": true }` -> DENIED (`affectedKeys().hasOnly(...)` + `keys().hasOnly(...)`).
6. **Unverified Admin Email Spoof**: Request with `auth.token.email == "thangboiahi@gmail.com"` and `email_verified == false` attempting `GET amc_tickets/t1` -> DENIED.
7. **Orphaned AMC Ticket / Spoofed 24h SLA**: `POST amc_tickets/t_fake` on a `core` home with `{ "priority_24h": true, "tier": "shield" }` -> DENIED via parent home `get()` check.
8. **Family Member Device Hijack**: Family member attempting `PATCH homes/home_1/devices/dd_pwr01` to change `local_pin` or `local_key` -> DENIED (owner/admin only).
9. **Closed Crash SOS Reopen / Tamper**: User updating `incidents/inc_1` where `existing().status == "resolved"` back to `"countdown"` -> DENIED (terminal state lock).
10. **Forged Trip Record Injection**: Home owner attempting `POST vehicles/dd_veh01/trips/fake_trip` -> DENIED (Cloud Run Bridge / Admin only).
11. **Oversized Document ID Poisoning**: `PUT homes/home_1/rooms/<200-char-junk-id>` -> DENIED by `isValidId()`.
12. **Client-Spoofed Timestamp**: `POST homes/home_1` with `{ "createdAt": "2020-01-01T00:00:00Z" }` instead of `request.time` -> DENIED.
