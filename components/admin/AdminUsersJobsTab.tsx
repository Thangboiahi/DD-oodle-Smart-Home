'use client';

import React, { useState } from 'react';
import { Ban, CheckCircle2, Clock, Send, ShieldCheck, Users, Wrench } from 'lucide-react';
import { SessionRole } from '@/lib/auth/session';
import { InstallerJobType } from '@/lib/installer/jobsStore';
import { useAdminErpStore } from '@/lib/admin/erpStore';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ThemedCheckbox,
  ThemedSelect,
  useToast,
} from '@/components/ui';

export function AdminUsersJobsTab({
  actor,
}: {
  actor: { uid: string; email: string };
}) {
  const {
    accounts,
    jobs,
    subscriptions,
    setUserAccountRoleOrStatus,
    dispatchInstallerJob,
    revokeInstallerJob,
  } = useAdminErpStore();
  const { pushToast } = useToast();

  const installers = accounts.filter(
    (a) => (a.role === 'installer' || a.role === 'admin') && a.status === 'ACTIVE'
  );

  const [selectedInstallerUid, setSelectedInstallerUid] = useState(
    'uid_installer_manipur_01'
  );
  const [selectedHomeId, setSelectedHomeId] = useState('home_imphal_001');
  const [jobType, setJobType] = useState<InstallerJobType>('INITIAL_SETUP_LINKING');
  const [allow3dSetup, setAllow3dSetup] = useState<boolean>(true);
  const [expiryHours, setExpiryHours] = useState<string>('48');
  const [jobNotes, setJobNotes] = useState(
    'Install Switchboards, Tank Monitor, and verify G10 safety cutoffs.'
  );

  const handleDispatchJob = async () => {
    const inst = installers.find((i) => i.uid === selectedInstallerUid) ?? installers[0];
    const home = subscriptions.find((s) => s.homeId === selectedHomeId);
    if (!inst) {
      pushToast({ title: 'No active installer available', tone: 'warning' });
      return;
    }

    const effective3d = jobType === 'AMC_SWAP' ? false : allow3dSetup;

    await dispatchInstallerJob(
      {
        home_id: selectedHomeId,
        home_name: home?.customer ?? selectedHomeId,
        customer_name: home?.customer ?? selectedHomeId,
        customer_phone: home?.phone ?? '+919862000000',
        address: 'Manipur / NE India Verified Site',
        installer_uid: inst.uid,
        installer_name: inst.name,
        type: jobType,
        allow_3d_setup: effective3d,
        expiryHours: Number(expiryHours) || 48,
        notes: jobNotes.trim() || 'Standard field setup assignment.',
      },
      actor
    );

    pushToast({
      title: `Dispatched Job to ${inst.name}`,
      description: `${selectedHomeId} · ${jobType} · 3D=${effective3d ? 'ON' : 'OFF'} · ${expiryHours}h window`,
      tone: 'success',
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Dispatch Scoped Installer Authority */}
        <Card className="lg:col-span-5 hairline-border space-y-3.5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wrench className="h-4 w-4 text-primary" />
              <span>Dispatch Scoped Installer Job</span>
            </CardTitle>
            <Badge variant="accent">TTL + RBAC GATED</Badge>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            <div className="space-y-1">
              <span className="font-medium text-foreground-secondary block">Assign Field Installer</span>
              <ThemedSelect
                ariaLabel="Select installer"
                value={selectedInstallerUid}
                onChange={setSelectedInstallerUid}
                options={installers.map((i) => ({
                  value: i.uid,
                  label: `${i.name} (${i.role})`,
                }))}
              />
            </div>

            <div className="space-y-1">
              <span className="font-medium text-foreground-secondary block">Target Customer Home</span>
              <ThemedSelect
                ariaLabel="Select customer home"
                value={selectedHomeId}
                onChange={setSelectedHomeId}
                options={subscriptions.map((s) => ({
                  value: s.homeId,
                  label: `${s.customer} (${s.homeId})`,
                }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <span className="font-medium text-foreground-secondary block">Work Order Scope</span>
                <ThemedSelect
                  ariaLabel="Work order scope"
                  value={jobType}
                  onChange={(v) => setJobType(v as InstallerJobType)}
                  options={[
                    { value: 'INITIAL_SETUP_LINKING', label: 'Initial Setup & Linking' },
                    { value: 'FOLLOWUP_3D_SERVICE', label: 'Follow-Up 3D Service' },
                    { value: 'AMC_SWAP', label: 'AMC Swap Only (No 3D)' },
                  ]}
                />
              </div>

              <div className="space-y-1">
                <span className="font-medium text-foreground-secondary block">Expiry Window</span>
                <ThemedSelect
                  ariaLabel="Job expiry window"
                  value={expiryHours}
                  onChange={setExpiryHours}
                  options={[
                    { value: '24', label: '24 Hours' },
                    { value: '48', label: '48 Hours' },
                    { value: '72', label: '72 Hours' },
                  ]}
                />
              </div>
            </div>

            <ThemedCheckbox
              variant="card"
              checked={jobType === 'AMC_SWAP' ? false : allow3dSetup}
              disabled={jobType === 'AMC_SWAP'}
              onChange={setAllow3dSetup}
              label="Authorize 3D Home Twin Builder (`allow_3d_setup`)"
              description="Required for field installer to access Home3DTwinView on this home (disabled automatically for AMC_SWAP)."
            />

            <label className="block space-y-1">
              <span className="font-medium text-foreground-secondary">Installer Notes</span>
              <textarea
                rows={2}
                value={jobNotes}
                onChange={(e) => setJobNotes(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-elevated p-2.5 text-foreground"
              />
            </label>

            <Button
              variant="primary"
              className="w-full"
              touchTarget
              onClick={() => void handleDispatchJob()}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Authorize &amp; Dispatch Job to /installer</span>
            </Button>
          </CardContent>
        </Card>

        {/* Right: Active & Historical Installer Jobs + Instant 1-Tap Revoke */}
        <Card className="lg:col-span-7 hairline-border space-y-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-success" />
              <span>Installer Authority Monitor (`installer_jobs`)</span>
            </CardTitle>
            <Badge variant="mono">
              {jobs.filter((j) => j.status === 'ACTIVE').length} Active
            </Badge>
          </CardHeader>

          <CardContent className="space-y-2.5 text-xs">
            {jobs.map((job) => {
              const isActive = job.status === 'ACTIVE' && job.expiresAtMs > Date.now();
              return (
                <div
                  key={job.job_id}
                  className="rounded-xl border border-border bg-surface-elevated/65 p-3 flex flex-wrap items-center justify-between gap-2.5"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={isActive ? 'success' : 'danger'}>{job.status}</Badge>
                      <Badge variant="accent">{job.type}</Badge>
                      <Badge variant={job.allow_3d_setup ? 'mono' : 'warning'}>
                        {job.allow_3d_setup ? '3D ALLOWED' : 'NO 3D'}
                      </Badge>
                    </div>
                    <div className="font-semibold text-foreground">
                      {job.installer_name} → {job.home_name}
                    </div>
                    <div className="text-[10px] font-mono text-foreground-muted flex items-center gap-2 flex-wrap">
                      <span>{job.job_id}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Expires{' '}
                        {new Date(job.expiresAtMs).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {isActive && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        await revokeInstallerJob(job.job_id, actor);
                        pushToast({
                          title: `Revoked ${job.installer_name} Access`,
                          description: `Installer access to ${job.home_name} & 3D layout terminated immediately.`,
                          tone: 'warning',
                        });
                      }}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>1-Tap Revoke</span>
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Accounts, Roles & Promote/Revoke Installer */}
      <Card noPadding className="overflow-hidden hairline-border">
        <div className="p-3.5 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span>Users, Family Members &amp; Installer Roles</span>
          </div>
          <Badge variant="mono">{accounts.length} Accounts</Badge>
        </div>

        <div className="overflow-x-auto dd-scroll">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/60 text-[11px] font-mono text-foreground-muted">
                <th className="p-3">User / UID</th>
                <th className="p-3">Contact</th>
                <th className="p-3 min-w-[155px]">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.uid} className="border-b border-border/40 last:border-b-0">
                  <td className="p-3">
                    <div className="font-semibold text-foreground">{acc.name}</div>
                    <div className="text-[10px] font-mono text-foreground-muted">{acc.uid}</div>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-foreground-secondary">
                    <div>{acc.phone}</div>
                    <div className="text-foreground-muted">{acc.email}</div>
                  </td>
                  <td className="p-3">
                    <ThemedSelect
                      ariaLabel={`Role for ${acc.name}`}
                      value={acc.role}
                      disabled={acc.uid === actor.uid}
                      onChange={async (val) => {
                        await setUserAccountRoleOrStatus(
                          acc.uid,
                          { role: val as SessionRole },
                          actor
                        );
                        pushToast({
                          title: `${acc.name} Role -> ${val.toUpperCase()}`,
                          tone: 'info',
                        });
                      }}
                      options={[
                        { value: 'customer', label: 'customer' },
                        { value: 'family_member', label: 'family_member' },
                        { value: 'installer', label: 'installer' },
                        { value: 'admin', label: 'admin' },
                      ]}
                    />
                  </td>
                  <td className="p-3">
                    <Badge variant={acc.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {acc.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    {acc.uid !== actor.uid && (
                      <Button
                        variant={acc.status === 'ACTIVE' ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={async () => {
                          const nextStatus =
                            acc.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                          await setUserAccountRoleOrStatus(
                            acc.uid,
                            { status: nextStatus },
                            actor
                          );
                          pushToast({
                            title: `${acc.name} -> ${nextStatus}`,
                            tone: nextStatus === 'ACTIVE' ? 'success' : 'warning',
                          });
                        }}
                      >
                        {acc.status === 'ACTIVE' ? (
                          <>
                            <Ban className="h-3 w-3" />
                            <span>Suspend</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-success" />
                            <span>Activate</span>
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
