/**
 * Deep Revenue Calculation Engine
 *
 * Pure, zero-dependency calculation engine for commercial, retail, and agricultural revenue analytics.
 * Computes Gross Revenue, Deductions, Net Revenue, COGS (including shrinkage/spoilage & cold-chain),
 * Gross Margin, Contribution Margin 1 (CM1) per channel, EBITDA, and formula logs in Vietnamese & English.
 */

export interface RevenueInput {
  /** Gross sales / revenue before deductions ($R_{gross} = \sum P_i \times Q_i$) */
  grossRevenue: number;
  /** Trade discounts, promotions, voucher incentives ($D_{promo}$) */
  discounts?: number;
  /** Product returns & customer refunds ($R_{returns}$) */
  returns?: number;
  /** Damaged goods allowances, rebates, billing adjustments ($A_{allowances}$) */
  allowances?: number;
  /** Explicit direct cost of goods sold before adjustments */
  cogs?: number;
  /** Beginning inventory for periodic inventory calculation */
  beginningInventory?: number;
  /** Direct purchases & landed manufacturing costs during period */
  purchases?: number;
  /** Ending inventory at period close */
  endingInventory?: number;
  /** Inbound shipping and freight costs */
  freightIn?: number;
  /** Post-harvest spoilage / shrinkage loss rate (e.g. 0.04 for 4% produce loss) */
  spoilageRate?: number;
  /** Explicit spoilage or shrinkage cost */
  spoilageCost?: number;
  /** Cold-chain logistics, temperature-controlled warehousing */
  coldChainCost?: number;
  /** Operating expenses (S&M, G&A, R&D) */
  opex?: number;
  /** Preferred display currency: 'USD' | 'VND' | 'AUTO' */
  currency?: 'USD' | 'VND' | 'AUTO';
  /** Breakdown by sales / distribution channel */
  channelBreakdown?: Array<{
    channel: string;
    grossRevenue: number;
    discounts?: number;
    returns?: number;
    cogs?: number;
    channelFees?: number;
    freight?: number;
  }>;
  /** Breakdown across financial periods (Quarters / Months) */
  periodBreakdown?: Array<{
    period: string;
    grossRevenue: number;
    discounts?: number;
    returns?: number;
    allowances?: number;
    cogs?: number;
    opex?: number;
  }>;
}

export interface ChannelRevenueMetrics {
  channel: string;
  grossRevenue: number;
  discounts: number;
  returns: number;
  totalDeductions: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  channelFees: number;
  contributionMargin1: number;
  contributionMarginPct: number;
}

export interface PeriodRevenueMetrics {
  period: string;
  grossRevenue: number;
  totalDeductions: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  opex: number;
  ebitda: number;
  operatingMarginPct: number;
}

export interface RevenueMetrics {
  grossRevenue: number;
  discounts: number;
  returns: number;
  allowances: number;
  totalDeductions: number;
  netRevenue: number;
  baseCogs: number;
  spoilageLoss: number;
  freightCost: number;
  totalCogs: number;
  /** Alias for totalCogs to satisfy legacy interface contracts */
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  opex: number;
  ebitda: number;
  operatingMarginPct: number;
  channels: ChannelRevenueMetrics[];
  periods?: PeriodRevenueMetrics[];
  formulaLog: string[];
  formulaLogVi: string[];
  formulaLogEn: string[];
}

/**
 * Format numbers with compact suffixes ($2.45M, 54.6B, 120K)
 */
export function formatCompactNumber(n: number, currency: 'USD' | 'VND' | 'AUTO' = 'AUTO'): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (currency === 'VND' || (currency === 'AUTO' && abs >= 1e8)) {
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(abs >= 1e13 ? 1 : 2)} nghìn tỷ ₫`;
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)} tỷ ₫`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)} tr ₫`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}k ₫`;
    return `${sign}${abs.toLocaleString('vi-VN')} ₫`;
  }

  const prefix = currency === 'USD' || currency === 'AUTO' ? '$' : '';
  if (abs >= 1e9) return `${sign}${prefix}${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `${sign}${prefix}${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `${sign}${prefix}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${prefix}${Number.isInteger(abs) ? abs.toString() : abs.toFixed(2)}`;
}

/**
 * Format currency with full precision and symbol
 */
export function formatCurrency(
  val: number,
  currency: 'USD' | 'VND' | 'AUTO' = 'AUTO',
  locale = 'vi-VN',
): string {
  if (!Number.isFinite(val)) return '0';
  if (currency === 'VND' || (currency === 'AUTO' && Math.abs(val) >= 1e8)) {
    return `${val.toLocaleString(locale)} ₫`;
  }
  return `$${val.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Format percentages with standard precision (e.g. 24.8%)
 */
export function formatPercent(val: number, decimals = 1): string {
  if (!Number.isFinite(val)) return '0.0%';
  return `${val.toFixed(decimals)}%`;
}

/**
 * Core mathematical engine for deep revenue analysis.
 * Adheres strictly to standard GAAP / IFRS principles while supporting retail & agricultural specifics.
 */
export function computeRevenueMetrics(input: RevenueInput): RevenueMetrics {
  const gross = Number(input.grossRevenue) || 0;
  const discounts = Math.max(0, Number(input.discounts) || 0);
  const returns = Math.max(0, Number(input.returns) || 0);
  const allowances = Math.max(0, Number(input.allowances) || 0);

  // 1. Deductions & Net Revenue
  const totalDeductions = discounts + returns + allowances;
  const netRevenue = gross - totalDeductions;

  // 2. Cost of Goods Sold (COGS)
  let baseCogs = 0;
  if (
    input.beginningInventory !== undefined &&
    input.purchases !== undefined &&
    input.endingInventory !== undefined
  ) {
    const beg = Number(input.beginningInventory) || 0;
    const purchases = Number(input.purchases) || 0;
    const end = Number(input.endingInventory) || 0;
    baseCogs = Math.max(0, beg + purchases - end);
  } else {
    baseCogs = Math.max(0, Number(input.cogs) || 0);
  }

  // Spoilage / Shrinkage Loss (Agriculture & Fresh Food Produce)
  let spoilageLoss = 0;
  if (input.spoilageCost !== undefined && Number(input.spoilageCost) >= 0) {
    spoilageLoss = Number(input.spoilageCost);
  } else if (input.spoilageRate !== undefined && Number(input.spoilageRate) > 0) {
    const rate = Number(input.spoilageRate);
    spoilageLoss = baseCogs * rate;
  }

  // Inbound freight & Cold chain storage
  const freightCost = (Number(input.freightIn) || 0) + (Number(input.coldChainCost) || 0);

  const totalCogs = baseCogs + spoilageLoss + freightCost;

  // 3. Gross Profit & Margins
  const grossProfit = netRevenue - totalCogs;
  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  // 4. EBITDA & Operating Margin
  const opex = Math.max(0, Number(input.opex) || 0);
  const ebitda = grossProfit - opex;
  const operatingMarginPct = netRevenue > 0 ? (ebitda / netRevenue) * 100 : 0;

  // 5. Channel Breakdown & Contribution Margin 1 (CM1)
  const channels: ChannelRevenueMetrics[] = (input.channelBreakdown || []).map((ch) => {
    const chGross = Number(ch.grossRevenue) || 0;
    const chDisc = Math.max(0, Number(ch.discounts) || 0);
    const chRet = Math.max(0, Number(ch.returns) || 0);
    const chDeductions = chDisc + chRet;
    const chNet = chGross - chDeductions;
    const chCogs = Math.max(0, Number(ch.cogs) || 0);
    const chGP = chNet - chCogs;
    const chGMPct = chNet > 0 ? (chGP / chNet) * 100 : 0;
    const chFees = Math.max(0, Number(ch.channelFees) || 0) + Math.max(0, Number(ch.freight) || 0);
    const cm1 = chGP - chFees;
    const cmPct = chNet > 0 ? (cm1 / chNet) * 100 : 0;

    return {
      channel: ch.channel,
      grossRevenue: chGross,
      discounts: chDisc,
      returns: chRet,
      totalDeductions: chDeductions,
      netRevenue: chNet,
      cogs: chCogs,
      grossProfit: chGP,
      grossMarginPct: chGMPct,
      channelFees: chFees,
      contributionMargin1: cm1,
      contributionMarginPct: cmPct,
    };
  });

  // 6. Period Breakdown
  const periods: PeriodRevenueMetrics[] | undefined = input.periodBreakdown?.map((p) => {
    const pGross = Number(p.grossRevenue) || 0;
    const pDisc = Number(p.discounts) || 0;
    const pRet = Number(p.returns) || 0;
    const pAllow = Number(p.allowances) || 0;
    const pDeduct = pDisc + pRet + pAllow;
    const pNet = pGross - pDeduct;
    const pCogs = Number(p.cogs) || 0;
    const pGP = pNet - pCogs;
    const pGMPct = pNet > 0 ? (pGP / pNet) * 100 : 0;
    const pOpex = Number(p.opex) || 0;
    const pEbitda = pGP - pOpex;
    const pOMPct = pNet > 0 ? (pEbitda / pNet) * 100 : 0;

    return {
      period: p.period,
      grossRevenue: pGross,
      totalDeductions: pDeduct,
      netRevenue: pNet,
      cogs: pCogs,
      grossProfit: pGP,
      grossMarginPct: pGMPct,
      opex: pOpex,
      ebitda: pEbitda,
      operatingMarginPct: pOMPct,
    };
  });

  // 7. Formula Logs in Vietnamese & English
  const formulaLogVi: string[] = [
    `1. Giảm trừ doanh thu: Tổng = Giảm giá (${formatCompactNumber(discounts)}) + Trả hàng (${formatCompactNumber(returns)}) + Trợ cấp (${formatCompactNumber(allowances)}) = ${formatCompactNumber(totalDeductions)}`,
    `2. Doanh thu thuần: Doanh thu gộp (${formatCompactNumber(gross)}) - Giảm trừ (${formatCompactNumber(totalDeductions)}) = ${formatCompactNumber(netRevenue)}`,
    `3. Giá vốn COGS: Giá vốn gốc (${formatCompactNumber(baseCogs)}) + Hao hụt nông sản (${formatCompactNumber(spoilageLoss)}) + Logistics lạnh (${formatCompactNumber(freightCost)}) = ${formatCompactNumber(totalCogs)}`,
    `4. Lợi nhuận gộp: Doanh thu thuần (${formatCompactNumber(netRevenue)}) - COGS (${formatCompactNumber(totalCogs)}) = ${formatCompactNumber(grossProfit)} (Biên: ${formatPercent(grossMarginPct)})`,
    `5. EBITDA: Lợi nhuận gộp (${formatCompactNumber(grossProfit)}) - OPEX (${formatCompactNumber(opex)}) = ${formatCompactNumber(ebitda)} (Biên hoạt động: ${formatPercent(operatingMarginPct)})`,
  ];

  if (channels.length > 0) {
    formulaLogVi.push(
      `6. Biên đóng góp CM1 theo kênh: ${channels.map((c) => `${c.channel}: ${formatCompactNumber(c.contributionMargin1)} (${formatPercent(c.contributionMarginPct)})`).join(', ')}`,
    );
  }

  const formulaLogEn: string[] = [
    `1. Deductions: Total = Discounts (${formatCompactNumber(discounts)}) + Returns (${formatCompactNumber(returns)}) + Allowances (${formatCompactNumber(allowances)}) = ${formatCompactNumber(totalDeductions)}`,
    `2. Net Revenue: Gross Revenue (${formatCompactNumber(gross)}) - Deductions (${formatCompactNumber(totalDeductions)}) = ${formatCompactNumber(netRevenue)}`,
    `3. COGS: Base COGS (${formatCompactNumber(baseCogs)}) + Spoilage/Shrinkage (${formatCompactNumber(spoilageLoss)}) + Freight/Cold-chain (${formatCompactNumber(freightCost)}) = ${formatCompactNumber(totalCogs)}`,
    `4. Gross Profit: Net Revenue (${formatCompactNumber(netRevenue)}) - COGS (${formatCompactNumber(totalCogs)}) = ${formatCompactNumber(grossProfit)} (Gross Margin: ${formatPercent(grossMarginPct)})`,
    `5. EBITDA: Gross Profit (${formatCompactNumber(grossProfit)}) - OPEX (${formatCompactNumber(opex)}) = ${formatCompactNumber(ebitda)} (Operating Margin: ${formatPercent(operatingMarginPct)})`,
  ];

  if (channels.length > 0) {
    formulaLogEn.push(
      `6. Channel CM1: ${channels.map((c) => `${c.channel}: ${formatCompactNumber(c.contributionMargin1)} (${formatPercent(c.contributionMarginPct)})`).join(', ')}`,
    );
  }

  return {
    grossRevenue: gross,
    discounts,
    returns,
    allowances,
    totalDeductions,
    netRevenue,
    baseCogs,
    spoilageLoss,
    freightCost,
    totalCogs,
    cogs: totalCogs,
    grossProfit,
    grossMarginPct,
    opex,
    ebitda,
    operatingMarginPct,
    channels,
    periods,
    formulaLog: formulaLogVi,
    formulaLogVi,
    formulaLogEn,
  };
}

/**
 * Agricultural / Fresh Produce Specific Revenue Calculator
 */
export function computeAgriRevenue(input: {
  harvestVolumeKg: number;
  pricePerKg: number;
  spoilageRate: number; // e.g. 0.05 for 5% post-harvest loss
  coldStorageCostPerKg?: number;
  inboundTransportPerKg?: number;
  productionCostPerKg: number;
  channelDiscounts?: number;
}): RevenueMetrics {
  const gross = input.harvestVolumeKg * input.pricePerKg;
  const effectiveVolume = input.harvestVolumeKg * (1 - input.spoilageRate);
  const baseCogs = input.harvestVolumeKg * input.productionCostPerKg;
  const spoilageLoss = input.harvestVolumeKg * input.spoilageRate * input.pricePerKg;
  const coldCost = input.harvestVolumeKg * (input.coldStorageCostPerKg || 0);
  const freight = input.harvestVolumeKg * (input.inboundTransportPerKg || 0);

  return computeRevenueMetrics({
    grossRevenue: gross,
    discounts: input.channelDiscounts || 0,
    cogs: baseCogs,
    spoilageCost: spoilageLoss,
    coldChainCost: coldCost,
    freightIn: freight,
  });
}

// ── 8. What-If Financial Scenario Simulation Engine ────────────────────────

export interface WhatIfLevers {
  /** Discount adjustment %: 0 to 30 (e.g. 5 for +5% discount) */
  discountPercent?: number;
  /** Volume growth adjustment %: -30 to +50 (e.g. 20 for +20% order volume) */
  volumeGrowthPercent?: number;
  /** CAC / Marketing spend adjustment %: -40 to +40 (e.g. 15 for +15% CAC) */
  cacAdjustmentPercent?: number;
  /** Spoilage and cancellation rate %: 0 to 20 (e.g. 5 for 5% spoilage/cancel) */
  spoilagePercent?: number;
}

export type WhatIfPresetType = 'optimistic' | 'base' | 'conservative' | 'custom';

export const WHAT_IF_PRESETS: Record<'optimistic' | 'base' | 'conservative', Required<WhatIfLevers>> = {
  optimistic: {
    discountPercent: 5,
    volumeGrowthPercent: 20,
    cacAdjustmentPercent: -5,
    spoilagePercent: 2,
  },
  base: {
    discountPercent: 0,
    volumeGrowthPercent: 0,
    cacAdjustmentPercent: 0,
    spoilagePercent: 0,
  },
  conservative: {
    discountPercent: 15,
    volumeGrowthPercent: -15,
    cacAdjustmentPercent: 15,
    spoilagePercent: 8,
  },
};

export interface WhatIfDeltas {
  grossRevenueDelta: number;
  grossRevenueDeltaPct: number;
  netRevenueDelta: number;
  netRevenueDeltaPct: number;
  totalCogsDelta: number;
  totalCogsDeltaPct: number;
  grossProfitDelta: number;
  grossProfitDeltaPct: number;
  grossMarginDeltaPct: number;
  ebitdaDelta: number;
  ebitdaDeltaPct: number;
}

export interface WhatIfSimulationResult {
  baseMetrics: RevenueMetrics;
  simulatedMetrics: RevenueMetrics;
  levers: Required<WhatIfLevers>;
  preset: WhatIfPresetType;
  deltas: WhatIfDeltas;
  summarySentenceVi: string;
  summarySentenceEn: string;
}

function detectPreset(levers: Required<WhatIfLevers>): WhatIfPresetType {
  const keys: Array<'optimistic' | 'base' | 'conservative'> = ['optimistic', 'base', 'conservative'];
  for (const k of keys) {
    const p = WHAT_IF_PRESETS[k];
    if (
      levers.discountPercent === p.discountPercent &&
      levers.volumeGrowthPercent === p.volumeGrowthPercent &&
      levers.cacAdjustmentPercent === p.cacAdjustmentPercent &&
      levers.spoilagePercent === p.spoilagePercent
    ) {
      return k;
    }
  }
  return 'custom';
}

/**
 * Pure reactive calculation engine for What-If scenario simulation.
 * Computes live GAAP/IFRS delta changes with zero latency (<16ms).
 */
export function simulateWhatIfScenario(
  baseInputOrMetrics: RevenueInput | RevenueMetrics,
  leversInput?: WhatIfLevers,
  presetInput?: WhatIfPresetType,
): WhatIfSimulationResult {
  const baseMetrics = 'totalDeductions' in baseInputOrMetrics
    ? (baseInputOrMetrics as RevenueMetrics)
    : computeRevenueMetrics(baseInputOrMetrics as RevenueInput);

  const presetToApply = presetInput && presetInput !== 'custom' ? presetInput : undefined;
  const defaultValues = presetToApply ? WHAT_IF_PRESETS[presetToApply] : WHAT_IF_PRESETS.base;

  const levers: Required<WhatIfLevers> = {
    discountPercent: Math.min(30, Math.max(0, leversInput?.discountPercent ?? defaultValues.discountPercent)),
    volumeGrowthPercent: Math.min(50, Math.max(-30, leversInput?.volumeGrowthPercent ?? defaultValues.volumeGrowthPercent)),
    cacAdjustmentPercent: Math.min(40, Math.max(-40, leversInput?.cacAdjustmentPercent ?? defaultValues.cacAdjustmentPercent)),
    spoilagePercent: Math.min(20, Math.max(0, leversInput?.spoilagePercent ?? defaultValues.spoilagePercent)),
  };

  const preset = presetInput || detectPreset(levers);

  const volumeFactor = 1 + levers.volumeGrowthPercent / 100;
  const cacFactor = 1 + levers.cacAdjustmentPercent / 100;

  // 1. Simulated Gross & Deductions
  const simulatedGross = baseMetrics.grossRevenue * volumeFactor;
  const baseDiscounts = baseMetrics.discounts * volumeFactor;
  const extraDiscount = simulatedGross * (levers.discountPercent / 100);
  const simulatedDiscounts = baseDiscounts + extraDiscount;
  const simulatedReturns = baseMetrics.returns * volumeFactor;
  const simulatedAllowances = baseMetrics.allowances * volumeFactor;
  const simulatedTotalDeductions = simulatedDiscounts + simulatedReturns + simulatedAllowances;
  const simulatedNet = simulatedGross - simulatedTotalDeductions;

  // 2. Simulated COGS
  const simulatedBaseCogs = baseMetrics.baseCogs * volumeFactor;
  const extraSpoilage = simulatedBaseCogs * (levers.spoilagePercent / 100);
  const simulatedSpoilageLoss = (baseMetrics.spoilageLoss * volumeFactor) + extraSpoilage;
  const simulatedFreight = baseMetrics.freightCost * volumeFactor;
  const simulatedTotalCogs = simulatedBaseCogs + simulatedSpoilageLoss + simulatedFreight;

  // 3. Simulated GP, OPEX, EBITDA
  const simulatedGP = simulatedNet - simulatedTotalCogs;
  const simulatedGMPct = simulatedNet > 0 ? (simulatedGP / simulatedNet) * 100 : 0;
  const simulatedOpex = baseMetrics.opex * cacFactor;
  const simulatedEbitda = simulatedGP - simulatedOpex;
  const simulatedOMPct = simulatedNet > 0 ? (simulatedEbitda / simulatedNet) * 100 : 0;

  // 4. Channels
  const simulatedChannels: ChannelRevenueMetrics[] = (baseMetrics.channels || []).map((ch) => {
    const chGross = ch.grossRevenue * volumeFactor;
    const chDisc = (ch.discounts * volumeFactor) + (chGross * (levers.discountPercent / 100));
    const chRet = ch.returns * volumeFactor;
    const chDeductions = chDisc + chRet;
    const chNet = chGross - chDeductions;
    const chCogs = ch.cogs * volumeFactor;
    const chGP = chNet - chCogs;
    const chGMPct = chNet > 0 ? (chGP / chNet) * 100 : 0;
    const chFees = ch.channelFees * cacFactor;
    const cm1 = chGP - chFees;
    const cmPct = chNet > 0 ? (cm1 / chNet) * 100 : 0;
    return {
      channel: ch.channel,
      grossRevenue: chGross,
      discounts: chDisc,
      returns: chRet,
      totalDeductions: chDeductions,
      netRevenue: chNet,
      cogs: chCogs,
      grossProfit: chGP,
      grossMarginPct: chGMPct,
      channelFees: chFees,
      contributionMargin1: cm1,
      contributionMarginPct: cmPct,
    };
  });

  const simulatedMetrics: RevenueMetrics = {
    grossRevenue: simulatedGross,
    discounts: simulatedDiscounts,
    returns: simulatedReturns,
    allowances: simulatedAllowances,
    totalDeductions: simulatedTotalDeductions,
    netRevenue: simulatedNet,
    baseCogs: simulatedBaseCogs,
    spoilageLoss: simulatedSpoilageLoss,
    freightCost: simulatedFreight,
    totalCogs: simulatedTotalCogs,
    cogs: simulatedTotalCogs,
    grossProfit: simulatedGP,
    grossMarginPct: simulatedGMPct,
    opex: simulatedOpex,
    ebitda: simulatedEbitda,
    operatingMarginPct: simulatedOMPct,
    channels: simulatedChannels,
    formulaLog: [
      `[What-If ${preset.toUpperCase()}] Giả lập: Sản lượng (${levers.volumeGrowthPercent >= 0 ? '+' : ''}${levers.volumeGrowthPercent}%), Chiết khấu (${levers.discountPercent}%), CAC (${levers.cacAdjustmentPercent >= 0 ? '+' : ''}${levers.cacAdjustmentPercent}%), Hao hụt (${levers.spoilagePercent}%)`,
      `Doanh thu thuần: ${formatCompactNumber(baseMetrics.netRevenue)} -> ${formatCompactNumber(simulatedNet)} (${simulatedNet >= baseMetrics.netRevenue ? '+' : ''}${formatPercent(baseMetrics.netRevenue > 0 ? ((simulatedNet - baseMetrics.netRevenue) / baseMetrics.netRevenue) * 100 : 0)})`,
      `Lợi nhuận gộp: ${formatCompactNumber(baseMetrics.grossProfit)} -> ${formatCompactNumber(simulatedGP)} (Biên: ${formatPercent(simulatedGMPct)})`,
      `EBITDA: ${formatCompactNumber(baseMetrics.ebitda)} -> ${formatCompactNumber(simulatedEbitda)}`,
    ],
    formulaLogVi: [],
    formulaLogEn: [],
  };
  simulatedMetrics.formulaLogVi = simulatedMetrics.formulaLog;
  simulatedMetrics.formulaLogEn = simulatedMetrics.formulaLog;

  // 5. Deltas
  const grossDelta = simulatedGross - baseMetrics.grossRevenue;
  const netDelta = simulatedNet - baseMetrics.netRevenue;
  const cogsDelta = simulatedTotalCogs - baseMetrics.totalCogs;
  const gpDelta = simulatedGP - baseMetrics.grossProfit;
  const ebitdaDelta = simulatedEbitda - baseMetrics.ebitda;

  const deltas: WhatIfDeltas = {
    grossRevenueDelta: grossDelta,
    grossRevenueDeltaPct: baseMetrics.grossRevenue > 0 ? (grossDelta / baseMetrics.grossRevenue) * 100 : 0,
    netRevenueDelta: netDelta,
    netRevenueDeltaPct: baseMetrics.netRevenue > 0 ? (netDelta / baseMetrics.netRevenue) * 100 : 0,
    totalCogsDelta: cogsDelta,
    totalCogsDeltaPct: baseMetrics.totalCogs > 0 ? (cogsDelta / baseMetrics.totalCogs) * 100 : 0,
    grossProfitDelta: gpDelta,
    grossProfitDeltaPct: baseMetrics.grossProfit > 0 ? (gpDelta / baseMetrics.grossProfit) * 100 : 0,
    grossMarginDeltaPct: simulatedGMPct - baseMetrics.grossMarginPct,
    ebitdaDelta: ebitdaDelta,
    ebitdaDeltaPct: baseMetrics.ebitda > 0 ? (ebitdaDelta / baseMetrics.ebitda) * 100 : 0,
  };

  const viDeltaNet = `${deltas.netRevenueDelta >= 0 ? '+' : ''}${formatCompactNumber(deltas.netRevenueDelta)} (${deltas.netRevenueDeltaPct >= 0 ? '+' : ''}${deltas.netRevenueDeltaPct.toFixed(1)}%)`;
  const viDeltaGP = `${deltas.grossProfitDelta >= 0 ? '+' : ''}${formatCompactNumber(deltas.grossProfitDelta)} (${deltas.grossProfitDeltaPct >= 0 ? '+' : ''}${deltas.grossProfitDeltaPct.toFixed(1)}%)`;

  return {
    baseMetrics,
    simulatedMetrics,
    levers,
    preset,
    deltas,
    summarySentenceVi: `Kịch bản ${preset}: Doanh thu thuần biến động ${viDeltaNet}, Lợi nhuận gộp biến động ${viDeltaGP}.`,
    summarySentenceEn: `Scenario ${preset}: Net revenue shifted by ${deltas.netRevenueDeltaPct.toFixed(1)}%, Gross profit shifted by ${deltas.grossProfitDeltaPct.toFixed(1)}%.`,
  };
}

