'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  Package,
  Plus,
  Receipt,
  Repeat,
  Search,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { HARDWARE_REGISTRY_MAP } from '@/lib/catalog/hardwareRegistry';
import {
  ExpenseCategory,
  PaymentMode,
  TransactionCategory,
  useAdminErpStore,
} from '@/lib/admin/erpStore';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SegmentedControl,
  ThemedDatePicker,
  ThemedSelect,
  useToast,
} from '@/components/ui';

type FinanceSubView = 'pnl' | 'transactions' | 'expenses';

const TX_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All Income Categories' },
  { value: 'HARDWARE_SALE', label: 'Hardware Sale' },
  { value: 'INSTALLATION_FEE', label: 'Installation Fee' },
  { value: 'DFY_3D_TWIN', label: 'DFY 3D Twin Commission' },
  { value: 'SUBSCRIPTION_RENEWAL', label: 'Subscription Renewal' },
  { value: 'SIM_RENEWAL', label: 'SIM Renewal (LTE)' },
  { value: 'REFUND', label: 'Refund / Credit Note' },
  { value: 'OTHER_INCOME', label: 'Other Income' },
];

const EXP_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All Expense Categories' },
  { value: 'HARDWARE_BOM', label: 'Hardware BOM & PCB' },
  { value: 'ENCLOSURE_FAB', label: 'Enclosure Fabrication' },
  { value: 'SHIPPING_GST', label: 'Shipping & GST' },
  { value: 'INSTALLER_PAYOUT', label: 'Installer Payout' },
  { value: 'CLOUD_MQTT_SIM', label: 'Cloud / MQTT / SIM Ops' },
  { value: 'OPERATIONS', label: 'Operations & Misc' },
];

const PAYMENT_MODE_OPTIONS: Array<{ value: PaymentMode; label: string }> = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank', label: 'Bank' },
  { value: 'Card', label: 'Card' },
  { value: 'Cash', label: 'Cash' },
];

const PAYMENT_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All Modes' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank', label: 'Bank' },
  { value: 'Card', label: 'Card' },
  { value: 'Cash', label: 'Cash' },
];

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function escapeCsvCell(value: string | number | undefined): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatMonthLabel(ym: string): string {
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const monthIdx = Number(parts[1]) - 1;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[monthIdx] ?? parts[1]} '${parts[0].slice(2)}`;
}

export function AdminFinanceLedger({
  actor,
}: {
  actor: { uid: string; email: string };
}) {
  const { transactions, expenses, recordTx, recordExp } = useAdminErpStore();
  const { pushToast } = useToast();

  const [subView, setSubView] = useState<FinanceSubView>('pnl');
  const [search, setSearch] = useState('');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('ALL');
  const [expCategoryFilter, setExpCategoryFilter] = useState<string>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  // Modals
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Transaction Form
  const todayIso = new Date().toISOString().slice(0, 10);
  const [txCustomer, setTxCustomer] = useState('');
  const [txCategory, setTxCategory] = useState<TransactionCategory>('HARDWARE_SALE');
  const [txAmount, setTxAmount] = useState('14999');
  const [txMode, setTxMode] = useState<PaymentMode>('UPI');
  const [txDate, setTxDate] = useState(todayIso);
  const [txRef, setTxRef] = useState('');
  const [txHomeId, setTxHomeId] = useState('');
  const [txNotes, setTxNotes] = useState('');

  // New Expense Form
  const [expVendor, setExpVendor] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('HARDWARE_BOM');
  const [expAmount, setExpAmount] = useState('5200');
  const [expMode, setExpMode] = useState<PaymentMode>('Bank');
  const [expDate, setExpDate] = useState(todayIso);
  const [expInvoiceRef, setExpInvoiceRef] = useState('');
  const [expDesc, setExpDesc] = useState('');

  // Live P&L Calculations
  const pnl = useMemo(() => {
    let grossIncome = 0;
    let refunds = 0;
    let recurringRealized = 0;
    let oneTimeRealized = 0;

    for (const tx of transactions) {
      if (tx.category === 'REFUND') {
        refunds += tx.amount_inr;
      } else {
        grossIncome += tx.amount_inr;
        if (tx.category === 'SUBSCRIPTION_RENEWAL' || tx.category === 'SIM_RENEWAL') {
          recurringRealized += tx.amount_inr;
        } else {
          oneTimeRealized += tx.amount_inr;
        }
      }
    }

    const netIncome = Math.max(0, grossIncome - refunds);
    const totalExpenses = expenses.reduce((acc, e) => acc + e.amount_inr, 0);
    const netProfit = netIncome - totalExpenses;
    const marginPct = netIncome > 0 ? Math.round((netProfit / netIncome) * 1000) / 10 : 0;

    const recurringSharePct =
      grossIncome > 0 ? Math.round((recurringRealized / grossIncome) * 100) : 0;

    return {
      grossIncome,
      refunds,
      netIncome,
      totalExpenses,
      netProfit,
      marginPct,
      recurringRealized,
      oneTimeRealized,
      recurringSharePct,
    };
  }, [transactions, expenses]);

  // Monthly grouped series for SVG chart
  const monthlySeries = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();

    for (const tx of transactions) {
      const m = tx.dateIso?.slice(0, 7) || todayIso.slice(0, 7);
      const cur = map.get(m) ?? { month: m, income: 0, expense: 0 };
      if (tx.category === 'REFUND') {
        cur.income = Math.max(0, cur.income - tx.amount_inr);
      } else {
        cur.income += tx.amount_inr;
      }
      map.set(m, cur);
    }

    for (const exp of expenses) {
      const m = exp.dateIso?.slice(0, 7) || todayIso.slice(0, 7);
      const cur = map.get(m) ?? { month: m, income: 0, expense: 0 };
      cur.expense += exp.amount_inr;
      map.set(m, cur);
    }

    const sorted = Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-8)
      .map((item) => ({
        ...item,
        profit: item.income - item.expense,
      }));

    return sorted;
  }, [transactions, expenses, todayIso]);

  // Per-Module Unit Economics
  const unitEconomics = useMemo(() => {
    const byCode = new Map<
      string,
      {
        code: string;
        name: string;
        unitsSold: number;
        grossRevenueInr: number;
        unitBomInr: number;
        totalCogsInr: number;
      }
    >();

    for (const tx of transactions) {
      if (tx.category === 'REFUND' || !tx.module_breakdown?.length) continue;
      for (const item of tx.module_breakdown) {
        const meta = HARDWARE_REGISTRY_MAP[item.module_code];
        const unitBom = item.bom_inr > 0 ? item.bom_inr : meta?.bomInr ?? 0;
        const cur = byCode.get(item.module_code) ?? {
          code: item.module_code,
          name: meta?.name ?? item.module_code,
          unitsSold: 0,
          grossRevenueInr: 0,
          unitBomInr: unitBom,
          totalCogsInr: 0,
        };
        cur.unitsSold += item.qty;
        cur.grossRevenueInr += item.revenue_inr;
        cur.totalCogsInr += unitBom * item.qty;
        byCode.set(item.module_code, cur);
      }
    }

    return Array.from(byCode.values())
      .map((row) => {
        const netMarginInr = row.grossRevenueInr - row.totalCogsInr;
        const marginPct =
          row.grossRevenueInr > 0
            ? Math.round((netMarginInr / row.grossRevenueInr) * 1000) / 10
            : 0;
        return { ...row, netMarginInr, marginPct };
      })
      .sort((a, b) => b.grossRevenueInr - a.grossRevenueInr);
  }, [transactions]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (txCategoryFilter !== 'ALL' && tx.category !== txCategoryFilter) return false;
      if (modeFilter !== 'ALL' && tx.payment_mode !== modeFilter) return false;
      if (!q) return true;
      return (
        tx.customer_name.toLowerCase().includes(q) ||
        tx.tx_ref.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        (tx.quote_id ?? '').toLowerCase().includes(q) ||
        (tx.home_id ?? '').toLowerCase().includes(q) ||
        tx.notes.toLowerCase().includes(q)
      );
    });
  }, [transactions, search, txCategoryFilter, modeFilter]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((exp) => {
      if (expCategoryFilter !== 'ALL' && exp.category !== expCategoryFilter) return false;
      if (modeFilter !== 'ALL' && exp.payment_mode !== modeFilter) return false;
      if (!q) return true;
      return (
        exp.vendor.toLowerCase().includes(q) ||
        exp.description.toLowerCase().includes(q) ||
        exp.category.toLowerCase().includes(q) ||
        (exp.invoice_ref ?? '').toLowerCase().includes(q)
      );
    });
  }, [expenses, search, expCategoryFilter, modeFilter]);

  const handleExportCsv = () => {
    const headers = [
      'RecordType',
      'Date',
      'ID',
      'RefOrInvoice',
      'Category',
      'Party',
      'PaymentMode',
      'AmountINR',
      'HomeOrQuote',
      'Notes',
    ];

    const rows: string[] = [headers.join(',')];

    for (const tx of filteredTransactions) {
      rows.push(
        [
          'TRANSACTION',
          tx.dateIso,
          tx.tx_id,
          tx.tx_ref,
          tx.category,
          tx.customer_name,
          tx.payment_mode,
          tx.category === 'REFUND' ? -tx.amount_inr : tx.amount_inr,
          tx.quote_id || tx.home_id || '',
          tx.notes,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    for (const exp of filteredExpenses) {
      rows.push(
        [
          'EXPENSE',
          exp.dateIso,
          exp.exp_id,
          exp.invoice_ref || '',
          exp.category,
          exp.vendor,
          exp.payment_mode,
          -exp.amount_inr,
          '',
          exp.description,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    rows.push('');
    rows.push(['SUMMARY', 'NetIncomeINR', pnl.netIncome].map(escapeCsvCell).join(','));
    rows.push(['SUMMARY', 'TotalExpensesINR', pnl.totalExpenses].map(escapeCsvCell).join(','));
    rows.push(['SUMMARY', 'NetProfitINR', pnl.netProfit].map(escapeCsvCell).join(','));
    rows.push(['SUMMARY', 'GrossMarginPct', `${pnl.marginPct}%`].map(escapeCsvCell).join(','));

    const csv = `\uFEFF${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ddoodle-pnl-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    pushToast({
      title: 'Ledger Exported to CSV',
      description: `Exported ${filteredTransactions.length} transactions & ${filteredExpenses.length} expenses.`,
      tone: 'success',
    });
  };

  const handleRecordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(txAmount) || 0);
    if (!txCustomer.trim() || amt <= 0) {
      pushToast({
        title: 'Enter a valid customer name and positive ₹ amount.',
        tone: 'warning',
      });
      return;
    }
    setSubmitting(true);
    try {
      await recordTx(
        {
          tx_ref:
            txRef.trim() ||
            `TX-${txDate.replace(/-/g, '').slice(2)}-${Date.now().toString().slice(-4)}`,
          category: txCategory,
          amount_inr: amt,
          payment_mode: txMode,
          customer_name: txCustomer.trim(),
          home_id: txHomeId.trim() || undefined,
          notes: txNotes.trim() || `${txCategory.replace(/_/g, ' ')} recorded by Admin`,
          dateIso: txDate || todayIso,
        },
        actor
      );
      pushToast({
        title: `Recorded ₹${amt.toLocaleString('en-IN')} (${txCategory})`,
        tone: 'success',
      });
      setTxCustomer('');
      setTxRef('');
      setTxHomeId('');
      setTxNotes('');
      setTxModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordExp = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(expAmount) || 0);
    if (!expVendor.trim() || amt <= 0) {
      pushToast({
        title: 'Enter a valid vendor name and positive ₹ expense.',
        tone: 'warning',
      });
      return;
    }
    setSubmitting(true);
    try {
      await recordExp(
        {
          category: expCategory,
          amount_inr: amt,
          vendor: expVendor.trim(),
          description: expDesc.trim() || `${expCategory.replace(/_/g, ' ')} disbursement`,
          payment_mode: expMode,
          invoice_ref: expInvoiceRef.trim() || undefined,
          dateIso: expDate || todayIso,
        },
        actor
      );
      pushToast({
        title: `Logged ₹${amt.toLocaleString('en-IN')} expense for ${expVendor.trim()}`,
        tone: 'info',
      });
      setExpVendor('');
      setExpInvoiceRef('');
      setExpDesc('');
      setExpModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const chartMaxVal = useMemo(() => {
    let m = 10000;
    for (const row of monthlySeries) {
      m = Math.max(m, row.income, row.expense, Math.abs(row.profit));
    }
    return m;
  }, [monthlySeries]);

  const activeMonthPoint =
    monthlySeries.find((m) => m.month === hoveredMonth) ??
    monthlySeries[monthlySeries.length - 1] ??
    null;

  return (
    <div className="space-y-4">
      <Banner
        tone="info"
        title="Admin-Only Financial Ledger & Unit Economics"
        description="Live Firestore & local P&L covering hardware BOM COGS, installation payouts, DFY 3D twins, Pro/Max subscriptions, SIM renewals, and CSV tax export. Strictly isolated from Customer and Installer roles."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => setTxModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span>Record Transaction</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setExpModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span>Log Expense</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={handleExportCsv}>
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        }
      />

      {/* Top P&L KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>NET INCOME</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
            {formatInr(pnl.netIncome)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {pnl.refunds > 0
              ? `Gross ${formatInr(pnl.grossIncome)} · Refunds ${formatInr(pnl.refunds)}`
              : `${transactions.length} revenue entries`}
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>TOTAL EXPENSES</span>
            <ArrowDownRight className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400 mt-1">
            {formatInr(pnl.totalExpenses)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {expenses.length} BOM, payout &amp; ops items
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>NET PROFIT</span>
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold font-mono mt-1 ${
              pnl.netProfit >= 0 ? 'text-primary' : 'text-red-400'
            }`}
          >
            {pnl.netProfit >= 0 ? formatInr(pnl.netProfit) : `-${formatInr(Math.abs(pnl.netProfit))}`}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Operating P&amp;L across all active streams
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>GROSS MARGIN</span>
            <Wallet className="h-3.5 w-3.5 text-accent" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-foreground mt-1">
            {pnl.marginPct}%
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {pnl.recurringSharePct}% recurring ARR / SIM mix
          </div>
        </Card>
      </div>

      {/* Recurring vs One-Time Split Bar */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
          <div className="flex items-center gap-2 font-semibold">
            <Repeat className="h-4 w-4 text-primary" />
            <span>Recurring Subscriptions &amp; SIM vs. One-Time Hardware/Setup</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
            <span className="text-primary">
              Recurring: {formatInr(pnl.recurringRealized)} ({pnl.recurringSharePct}%)
            </span>
            <span className="text-muted-foreground">
              One-Time: {formatInr(pnl.oneTimeRealized)} ({100 - pnl.recurringSharePct}%)
            </span>
          </div>
        </div>
        <div className="h-2.5 w-full rounded-full bg-background/80 border border-border/60 overflow-hidden flex">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(4, Math.min(96, pnl.recurringSharePct))}%` }}
          />
          <div
            className="h-full bg-emerald-500/70 transition-all duration-300"
            style={{ width: `${Math.max(4, Math.min(96, 100 - pnl.recurringSharePct))}%` }}
          />
        </div>
      </Card>

      {/* Filter Toolbar + Sub-View Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <SegmentedControl<FinanceSubView>
          value={subView}
          onChange={setSubView}
          options={[
            {
              value: 'pnl',
              label: 'P&L & Unit Economics',
              icon: <BarChart3 className="h-3.5 w-3.5" />,
            },
            {
              value: 'transactions',
              label: `Transactions (${filteredTransactions.length})`,
              icon: <Receipt className="h-3.5 w-3.5" />,
            },
            {
              value: 'expenses',
              label: `Expenses (${filteredExpenses.length})`,
              icon: <ArrowDownRight className="h-3.5 w-3.5" />,
            },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, vendor, ref..."
              aria-label="Search finance ledger"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {subView === 'transactions' && (
            <ThemedSelect
              ariaLabel="Filter transaction category"
              value={txCategoryFilter}
              onChange={setTxCategoryFilter}
              options={TX_CATEGORY_OPTIONS}
              className="min-w-[175px]"
            />
          )}

          {subView === 'expenses' && (
            <ThemedSelect
              ariaLabel="Filter expense category"
              value={expCategoryFilter}
              onChange={setExpCategoryFilter}
              options={EXP_CATEGORY_OPTIONS}
              className="min-w-[175px]"
            />
          )}

          {subView !== 'pnl' && (
            <ThemedSelect
              ariaLabel="Filter payment mode"
              value={modeFilter}
              onChange={setModeFilter}
              options={PAYMENT_FILTER_OPTIONS}
              className="min-w-[125px]"
            />
          )}
        </div>
      </div>

      {/* Sub-view 1: Monthly Chart + Unit Economics */}
      {subView === 'pnl' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Monthly Income vs. Expenses vs. Net Profit
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hover or tap any month column group to inspect exact ₹ cashflow.
                  </p>
                </div>
                {activeMonthPoint && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono bg-background/70 border border-border/60 rounded-lg px-2.5 py-1.5">
                    <span className="font-bold text-foreground">
                      {formatMonthLabel(activeMonthPoint.month)}
                    </span>
                    <span className="text-emerald-400">
                      In: {formatInr(activeMonthPoint.income)}
                    </span>
                    <span className="text-amber-400">
                      Exp: {formatInr(activeMonthPoint.expense)}
                    </span>
                    <span
                      className={
                        activeMonthPoint.profit >= 0 ? 'text-primary font-bold' : 'text-red-400 font-bold'
                      }
                    >
                      Net: {formatInr(activeMonthPoint.profit)}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {monthlySeries.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  No monthly cashflow entries yet. Record a transaction or expense to populate the chart.
                </p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${Math.max(420, monthlySeries.length * 86)} 210`}
                    className="w-full min-w-[360px] h-52 select-none"
                    role="img"
                    aria-label="Monthly Income Expense and Profit Bar Chart"
                  >
                    {/* Horizontal grid lines */}
                    {[0.25, 0.5, 0.75, 1].map((step) => {
                      const y = 165 - step * 135;
                      return (
                        <g key={step}>
                          <line
                            x1={28}
                            y1={y}
                            x2={Math.max(410, monthlySeries.length * 86 - 12)}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity={0.1}
                            strokeDasharray="3 3"
                          />
                          <text
                            x={4}
                            y={y + 3}
                            fill="currentColor"
                            fillOpacity={0.45}
                            fontSize={9}
                            fontFamily="monospace"
                          >
                            {Math.round((chartMaxVal * step) / 1000)}k
                          </text>
                        </g>
                      );
                    })}

                    {monthlySeries.map((pt, idx) => {
                      const groupX = 44 + idx * 82;
                      const incH = Math.max(3, (pt.income / chartMaxVal) * 135);
                      const expH = Math.max(3, (pt.expense / chartMaxVal) * 135);
                      const profH = Math.max(3, (Math.abs(pt.profit) / chartMaxVal) * 135);
                      const isActive = activeMonthPoint?.month === pt.month;

                      return (
                        <g
                          key={pt.month}
                          onMouseEnter={() => setHoveredMonth(pt.month)}
                          onClick={() => setHoveredMonth(pt.month)}
                          className="cursor-pointer"
                        >
                          {isActive && (
                            <rect
                              x={groupX - 6}
                              y={18}
                              width={68}
                              height={158}
                              rx={8}
                              fill="currentColor"
                              fillOpacity={0.05}
                            />
                          )}
                          {/* Income bar */}
                          <rect
                            x={groupX}
                            y={165 - incH}
                            width={16}
                            height={incH}
                            rx={3}
                            fill="#34d399"
                            fillOpacity={isActive ? 1 : 0.85}
                          />
                          {/* Expense bar */}
                          <rect
                            x={groupX + 20}
                            y={165 - expH}
                            width={16}
                            height={expH}
                            rx={3}
                            fill="#fbbf24"
                            fillOpacity={isActive ? 1 : 0.85}
                          />
                          {/* Profit bar */}
                          <rect
                            x={groupX + 40}
                            y={165 - profH}
                            width={16}
                            height={profH}
                            rx={3}
                            fill={pt.profit >= 0 ? 'var(--dd-color-1, #22d3ee)' : '#f87171'}
                            fillOpacity={isActive ? 1 : 0.9}
                          />
                          <text
                            x={groupX + 28}
                            y={186}
                            textAnchor="middle"
                            fill="currentColor"
                            fillOpacity={isActive ? 0.95 : 0.65}
                            fontSize={10}
                            fontFamily="monospace"
                          >
                            {formatMonthLabel(pt.month)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono text-muted-foreground mt-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
                      Income
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                      Expenses
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: 'var(--dd-color-1, #22d3ee)' }}
                      />
                      Net Profit
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-Module Unit Economics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Per-Module Unit Economics (Hardware BOM COGS vs. Realized Revenue)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {unitEconomics.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">
                  No itemized module sales recorded yet. Convert a customer quote or log a breakdown transaction to view per-SKU unit margins.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[620px]">
                    <thead>
                      <tr className="border-b border-border/60 text-[11px] font-mono text-muted-foreground">
                        <th className="py-2 pr-3">Module</th>
                        <th className="py-2 px-3 text-right">Units Sold</th>
                        <th className="py-2 px-3 text-right">Gross Revenue</th>
                        <th className="py-2 px-3 text-right">Unit BOM</th>
                        <th className="py-2 px-3 text-right">Total COGS</th>
                        <th className="py-2 pl-3 text-right">Net Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {unitEconomics.map((row) => (
                        <tr key={row.code} className="hover:bg-accent/5">
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-foreground">{row.code}</div>
                            <div className="text-[11px] text-muted-foreground">{row.name}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{row.unitsSold}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-foreground">
                            {formatInr(row.grossRevenueInr)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                            {formatInr(row.unitBomInr)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                            {formatInr(row.totalCogsInr)}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono">
                            <span className="text-emerald-400 font-semibold">
                              {formatInr(row.netMarginInr)}
                            </span>{' '}
                            <span className="text-[10px] text-muted-foreground">
                              ({row.marginPct}%)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-view 2: Transactions Ledger */}
      {subView === 'transactions' && (
        <div className="space-y-2.5">
          {filteredTransactions.length === 0 ? (
            <Card className="p-6 text-center text-xs text-muted-foreground">
              No transactions match the active filters.
            </Card>
          ) : (
            filteredTransactions.map((tx) => (
              <Card key={tx.tx_id} className="p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {tx.tx_ref}
                      </span>
                      <Badge variant={tx.category === 'REFUND' ? 'warning' : 'success'}>
                        {tx.category.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="neutral">{tx.payment_mode}</Badge>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {tx.dateIso}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground mt-1">{tx.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{tx.notes}</p>
                    {(tx.quote_id || tx.home_id) && (
                      <p className="text-[11px] font-mono text-muted-foreground mt-1">
                        {tx.quote_id ? `Quote: ${tx.quote_id} ` : ''}
                        {tx.home_id ? `Home: ${tx.home_id}` : ''}
                      </p>
                    )}
                  </div>
                  <div
                    className={`text-base font-bold font-mono ${
                      tx.category === 'REFUND' ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {tx.category === 'REFUND' ? '-' : '+'}
                    {formatInr(tx.amount_inr)}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Sub-view 3: Expenses Ledger */}
      {subView === 'expenses' && (
        <div className="space-y-2.5">
          {filteredExpenses.length === 0 ? (
            <Card className="p-6 text-center text-xs text-muted-foreground">
              No expense entries match the active filters.
            </Card>
          ) : (
            filteredExpenses.map((exp) => (
              <Card key={exp.exp_id} className="p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {exp.invoice_ref || exp.exp_id}
                      </span>
                      <Badge variant="warning">{exp.category.replace(/_/g, ' ')}</Badge>
                      <Badge variant="neutral">{exp.payment_mode}</Badge>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {exp.dateIso}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground mt-1">{exp.vendor}</p>
                    <p className="text-xs text-muted-foreground">{exp.description}</p>
                  </div>
                  <div className="text-base font-bold font-mono text-amber-400">
                    -{formatInr(exp.amount_inr)}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Record Transaction Modal */}
      <AnimatePresence>
        {txModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="w-full max-w-lg"
            >
              <Card className="p-5 border border-border shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />
                    Record Revenue / Refund Transaction
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTxModalOpen(false)}
                    aria-label="Close modal"
                    className="p-1 rounded-lg hover:bg-accent/15 text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleRecordTx} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                      Customer / Account Name *
                    </label>
                    <input
                      type="text"
                      value={txCustomer}
                      onChange={(e) => setTxCustomer(e.target.value)}
                      placeholder="e.g. Sanjoy Nongmaithem"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Category
                      </label>
                      <ThemedSelect
                        ariaLabel="Transaction category"
                        value={txCategory}
                        onChange={(v) => setTxCategory(v as TransactionCategory)}
                        options={TX_CATEGORY_OPTIONS.filter((o) => o.value !== 'ALL')}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Amount (₹ INR) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={txAmount}
                        onChange={(e) => setTxAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono text-foreground"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Payment Mode
                      </label>
                      <SegmentedControl<PaymentMode>
                        value={txMode}
                        onChange={setTxMode}
                        options={PAYMENT_MODE_OPTIONS}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Transaction Date
                      </label>
                      <ThemedDatePicker
                        value={txDate}
                        onChange={setTxDate}
                        ariaLabel="Transaction date"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Reference / UTR
                      </label>
                      <input
                        type="text"
                        value={txRef}
                        onChange={(e) => setTxRef(e.target.value)}
                        placeholder="Auto-generated if empty"
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono text-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Home ID (optional)
                      </label>
                      <input
                        type="text"
                        value={txHomeId}
                        onChange={(e) => setTxHomeId(e.target.value)}
                        placeholder="e.g. home_demo_01"
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono text-foreground"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={txNotes}
                      onChange={(e) => setTxNotes(e.target.value)}
                      placeholder="Invoice or settlement details"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setTxModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={submitting}>
                      {submitting ? 'Saving...' : 'Save Transaction'}
                    </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log Expense Modal */}
      <AnimatePresence>
        {expModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="w-full max-w-lg"
            >
              <Card className="p-5 border border-border shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ArrowDownRight className="h-4 w-4 text-amber-400" />
                    Log Operational / BOM Expense
                  </h3>
                  <button
                    type="button"
                    onClick={() => setExpModalOpen(false)}
                    aria-label="Close modal"
                    className="p-1 rounded-lg hover:bg-accent/15 text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleRecordExp} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                      Vendor / Payee *
                    </label>
                    <input
                      type="text"
                      value={expVendor}
                      onChange={(e) => setExpVendor(e.target.value)}
                      placeholder="e.g. Robu.in / LionCircuits / Field Tech"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Expense Category
                      </label>
                      <ThemedSelect
                        ariaLabel="Expense category"
                        value={expCategory}
                        onChange={(v) => setExpCategory(v as ExpenseCategory)}
                        options={EXP_CATEGORY_OPTIONS.filter((o) => o.value !== 'ALL')}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Amount (₹ INR) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={expAmount}
                        onChange={(e) => setExpAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono text-foreground"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Payment Mode
                      </label>
                      <SegmentedControl<PaymentMode>
                        value={expMode}
                        onChange={setExpMode}
                        options={PAYMENT_MODE_OPTIONS}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                        Expense Date
                      </label>
                      <ThemedDatePicker
                        value={expDate}
                        onChange={setExpDate}
                        ariaLabel="Expense date"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                      Invoice / Bill Reference
                    </label>
                    <input
                      type="text"
                      value={expInvoiceRef}
                      onChange={(e) => setExpInvoiceRef(e.target.value)}
                      placeholder="e.g. INV-LC-2026-089"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono text-foreground"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={expDesc}
                      onChange={(e) => setExpDesc(e.target.value)}
                      placeholder="Batch PCB assembly, HLK-PM03 power modules, or travel"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setExpModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={submitting}>
                      {submitting ? 'Logging...' : 'Log Expense'}
                    </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
