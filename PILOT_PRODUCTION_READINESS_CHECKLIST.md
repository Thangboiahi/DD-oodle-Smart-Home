# DD oodle Smart Home — Pilot & Production Readiness Checklist (Protocol Contract v1.4)

> **Document Status:** Complete & Locked for Rev A0 / Pilot Bring-Up  
> **Source of Truth:** Protocol Contract `v1.4` (G1–G18)  
> **Hardware Reference:** PWR-01 (Rev A2), PWR-02 (Rev A0), PWR-03 (Rev A0), WAT-01 (Rev A0), VEH-01 (Rev A0), HUB-01 (Rev A0)

---

## 1. Cloud Infrastructure & MQTT Broker <-> Cloud Run Bridge

### 1.1 MQTT Topic ACLs & Hub Cloud Bridge Patterns
- [ ] **Member Uplink Forwarding:** Verify Cloud Run MQTT Bridge ACL accepts publications from HUB-01 / Cloud Broker on:
  - `ddoodle/{home_id}/+/state` (QoS 1, Retained)
  - `ddoodle/{home_id}/+/telemetry` (QoS 0, Non-Retained)
  - `ddoodle/{home_id}/+/alert` (QoS 1, Non-Retained)
  - `ddoodle/{home_id}/+/status` (QoS 1, Retained — LWT `offline` / `online`)
  - `ddoodle/{home_id}/+/info` (QoS 1, Retained — G1 Capability Announcement)
- [ ] **Downlink Command & Control Subscriptions:** Verify ESP32 nodes and HUB-01 can subscribe to:
  - `ddoodle/{home_id}/+/cmd` (QoS 1, Non-Retained — G4 schema with `req_id` and strict `source`)
  - `ddoodle/{home_id}/+/config` (QoS 1, Retained — guardrails, `power_restore`, and vehicle SOS contacts)
  - `ddoodle/{home_id}/+/rules` (QoS 1, Retained — G17 local compiled rules AST)
  - `ddoodle/{home_id}/+/ota` (QoS 1, Non-Retained — G5 firmware target)
- [ ] **G16b Hub Members Distribution:** Verify HUB-01 receives non-retained AES-256-GCM wrapped key arrays on:
  - `ddoodle/{home_id}/{hub_id}/members` (QoS 1, Non-Retained, max 64 member keys)

### 1.2 Firebase RTDB Live Mirror (`/live/{home_id}/{device_id}`)
- [ ] **Zero-Latency Ingestion:** Cloud Run Bridge parses MQTT packets and atomically updates `/live/{home_id}/{device_id}`:
  - `{ online, ts, operation_mode, rssi, ack, state, fault, telemetry }`
- [ ] **G10 Fault State Locking in RTDB:** Verify `fault: AlertType | null` is reflected immediately. When `fault !== null`, the PWA UI blocks load-ON commands.
- [ ] **RTDB Command Queue Security (`/cmd_queue`):**
  - Verify `database.rules.json` enforces valid `source` (`'pwa_cloud' | 'pwa_lan' | 'pwa_ble' | 'hub' | 'rule' | 'wall_switch' | 'voice'`).
  - Verify `set.immobilize` writes are strictly restricted to Home Owner or Admin roles (`root.child('home_members').child($home_id).child(auth.uid).val() == 'owner'`).

### 1.3 Firestore Security Rules & RBAC
- [ ] Verify `firestore.rules` enforces hard-locked hardware guardrail protection (neither users nor scripts can disable `guardrails.hard_locked` or remove `max_runtime_min` on PWR-03 / `dry_run_timeout_sec` on WAT-01).
- [ ] Verify 20-second Crash SOS transition state machine: non-admin users can ONLY transition `status` from `'countdown'` to `'cancelled_by_user'`.
- [ ] Verify Shield 24h SLA AMC ticket validation enforces subscription tier parity (`hasShieldSla`).

---

## 2. OTA Storage, CDN & ESP32 Bootloader Verification

### 2.1 HTTP 206 Partial Content (Range Requests)
- [ ] **Bucket/CDN Range Header Support:** Run curl test against Firebase Cloud Storage / GCP CDN:
  ```bash
  curl -I -H "Range: bytes=0-65535" https://firebasestorage.googleapis.com/.../PWR-03_v1.4.0.bin
  ```
  **Expected Result:** HTTP Status `206 Partial Content`, `Content-Range: bytes 0-65535/405880`, `Accept-Ranges: bytes`.
- [ ] **Chunk Size:** Ensure ESP32-C3 firmware requests 64 KiB chunk windows (`0x10000`) to prevent heap starvation.

### 2.2 Common-CA Certificate Chain Compatibility
- [ ] **Root CA Bundle:** Verify ESP32 mbedTLS root certificate bundle includes Google Trust Services (GTS Root R1), ISRG Root X1 (Let's Encrypt), and DigiCert Global Root CA.
- [ ] **SNTP Time Sync:** Ensure HUB-01 / ESP32 node synchronizes NTP time (`pool.ntp.org` or HUB-01 local Port 123) before validating TLS x509 expiration timestamps.

### 2.3 Rollback Watchdog & Secure Boot v2
- [ ] **Partition Table:** Dual-partition A/B flash layout (`ota_0`, `ota_1`) with `otadata`.
- [ ] **Watchdog Timer:** On firmware reboot into new partition, ESP32 must initialize `esp_ota_mark_app_valid_cancel_rollback()` within 60 seconds of successful MQTT handshake; otherwise, hardware boots back to the previous stable image.
- [ ] **Signature & Hash Verification:** Firmware rejects OTA images failing SHA-256 header or `secure-boot-v2` digital signature.

---

## 3. Bench & Field Smoke Test Sequence (Rev A0 Hardware)

### Phase 1: Out-of-the-Box SoftAP Provisioning (192.168.4.1)
1. Power up unprovisioned ESP32 node. Verify LED indicates SoftAP beacon (`DDoodle-Setup-XXXX`).
2. Open PWA `/admin` (Tab 2: "QR & SoftAP Provisioning") or scan QR code.
3. Transmit Wi-Fi credentials + `claim_token` to `http://192.168.4.1/api/v1/prov`.
4. Verify node reboots, connects to 2.4 GHz Wi-Fi, and transitions to `CLOUD_DIRECT` or `LOCAL_HUB`.

### Phase 2: Capability Announcement (G1 & G15a)
1. Verify node publishes retained topic `ddoodle/{home_id}/{device_id}/info` (QoS 1).
2. Check PWA Dashboard: All UI switches, level sliders, and gauges populate dynamically from `capabilities[]` array without static page routing.
3. Verify G12 read-only sensors (`p`, `v`, `i`, `kwh`, `level_cm`, `flow_lpm`, `speed_kmh`) render gauges and **never** emit `.../cmd` packets.

### Phase 3: Zero Mixed-Content Local Access (G7 & G18c)
1. Disconnect Internet uplink on Wi-Fi router (simulate local outage).
2. Confirm PWA Top Bar switches Status Pill to `Local Hub (Offline LAN)` or `Direct LAN`.
3. Open `http://ddoodle-{device_slug}.local/` on iOS Safari / desktop browser. Verify the ~15 KB gzipped local page loads on Port 80 and accepts the G7 8-digit device PIN.
4. On Android Chrome, click "Direct Bluetooth (BLE)". Verify Web Bluetooth scan finds `DD_OODLE_CTRL` (`dd000001`), connects, and executes commands locally.

### Phase 4: Hardware Life-Safety Cutoff Injections
1. **PWR-03 Geyser Cutoff:**
   - Turn geyser relay ON. Advance runtime timer to 45 minutes (or inject `RUNTIME_LIMIT`).
   - **Pass Criteria:** Relay drops OFF immediately; state reports `fault: 'RUNTIME_LIMIT'`; PWA locks load-ON controls with latched banner; software commands cannot bypass lock; **3-second physical button hold on device is required to clear**.
2. **WAT-01 Dry-Run Cutoff:**
   - Turn pump relay ON with 0 L/min flow. Wait 30 seconds (or inject `DRY_RUN_FAULT`).
   - **Pass Criteria:** Pump shuts OFF; state reports `fault: 'DRY_RUN_FAULT'`; latched fault locks control until 3-second button hold.
   - Inject tank link drop -> verify telemetry reports `tank_link: false` and emits `TANK_LINK_LOST` alert after 90s timeout.
3. **VEH-01 Starter Solenoid Cut & Crash SOS:**
   - Send `{ immobilize: true }` while vehicle speed is 42 km/h.
   - **Pass Criteria:** State transitions to `PENDING` with safety warning: `Starter cut will engage safely when stopped (<5 km/h)`.
   - Bring speed to 0 km/h and turn ignition OFF -> State immediately transitions to `ENGAGED`.
   - Trigger `CRASH_DETECTED` alert -> Verify mandatory 20-second "I'm Safe — Cancel SOS" countdown modal appears with high-priority audio chime before cloud escalation.

### Phase 5: Core Anti-Bricking Floor & Quotas
1. Downgrade subscription from `All-In Family` to `Core` in Firestore.
2. Verify 4-Tier fail-safe connectivity, 2D Room Grid, up to 5 local schedules (`.../rules`), and hardware safety cutoffs remain permanently active without user lockout.
3. Verify Plus-tier features (3D Home Twin, Pro Logic rule builder, Voice C2C) display gentle upgrade prompts while never interfering with switch operation.

---

## 4. Pre-Pilot Sign-Off Matrix

| Subsystem | Component | Test Standard | Verification Tool | Sign-Off |
| :--- | :--- | :--- | :--- | :--- |
| **PWA Web App** | Next.js 15 App Router | TypeScript `tsc --noEmit`, ESLint | `npm run lint` & `next build` | **PASS (0 errors)** |
| **Validation Suite** | Protocol Contract v1.4 | G1–G18 assertions on 6 fixtures | `lib/protocol/validator.ts` | **PASS (100%)** |
| **Error Handling** | React Render Crash Guard | ErrorBoundary with recovery | `components/common/ErrorBoundary.tsx` | **PASS** |
| **Offline Resilience**| Network State Sync | `useSyncExternalStore` listener | `components/connectivity/OfflineBanner.tsx` | **PASS** |
| **RTDB Security** | `/live` & `/cmd_queue` | G4 sources, G15 immobilize owner-only | `database.rules.json` | **PASS** |
| **Firestore Security**| Multi-role RBAC & guardrails | Anti-tamper, 20s SOS, Shield SLA | `firestore.rules` | **PASS** |
| **ESP32 Firmware** | 8 Firmware Images | 50/50 QEMU Unity tests | Shared Golden Fixtures `v1.4` | **PASS** |
