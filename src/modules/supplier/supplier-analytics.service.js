const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');

/**
 * Supplier Analytics Service
 * Advanced analytics utilities to support procurement optimization and supplier management.
 */

async function getCostTrendsBySupplier({ tenantId, supplierId, itemId, startDate, endDate, groupBy = 'month' }) {
  if (!tenantId) throw new ValidationError('tenantId is required');

  const where = {
    supplierId,
    ...(itemId && { items: { some: { itemId } } }),
    ...(startDate || endDate ? { createdAt: { gte: startDate || new Date(0), lte: endDate || new Date() } } : {})
  };

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: 'asc' }
  });

  const buckets = {};
  const toKey = (d) => {
    const date = new Date(d);
    switch (groupBy) {
      case 'day': return date.toISOString().slice(0, 10);
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().slice(0, 10);
      }
      case 'month':
      default:
        return date.toISOString().slice(0, 7);
    }
  };

  for (const po of purchaseOrders) {
    const key = toKey(po.createdAt);
    if (!buckets[key]) buckets[key] = { period: key, orders: 0, quantity: 0, cost: 0 };
    buckets[key].orders += 1;
    for (const item of po.items) {
      buckets[key].quantity += parseFloat(item.quantity);
      buckets[key].cost += parseFloat(item.quantity) * parseFloat(item.unitCost);
    }
  }

  const trends = Object.values(buckets)
    .sort((a, b) => new Date(a.period) - new Date(b.period))
    .map(b => ({
      ...b,
      avgUnitCost: b.quantity > 0 ? b.cost / b.quantity : 0,
      avgOrderValue: b.orders > 0 ? b.cost / b.orders : 0
    }));

  return { trends };
}

async function compareSupplierCostsForItem({ tenantId, itemId }) {
  if (!tenantId || !itemId) throw new ValidationError('tenantId and itemId are required');

  // Validate item belongs to tenant
  const item = await prisma.item.findFirst({ where: { id: itemId, tenantId }, select: { id: true, name: true, sku: true } });
  if (!item) throw new NotFoundError('Item not found for tenant');

  const relations = await prisma.itemSupplier.findMany({
    where: { itemId },
    include: { supplier: { select: { id: true, name: true, rating: true } } },
    orderBy: { cost: 'asc' }
  });

  const cheapest = relations[0] ? parseFloat(relations[0].cost) : null;
  const suppliers = relations.map(r => ({
    supplier: r.supplier,
    cost: parseFloat(r.cost),
    leadTime: r.leadTime || null,
    deltaFromCheapest: cheapest != null ? parseFloat(r.cost) - cheapest : null
  }));

  return { item, suppliers };
}

async function getLeadTimeAnalysis({ tenantId, supplierId }) {
  if (!tenantId) throw new ValidationError('tenantId is required');

  const where = { item: { tenantId }, ...(supplierId && { supplierId }) };
  const relations = await prisma.itemSupplier.findMany({
    where,
    include: { supplier: { select: { id: true, name: true } }, item: { select: { id: true, name: true, sku: true } } }
  });

  const bySupplier = relations.reduce((acc, r) => {
    const key = r.supplierId;
    if (!acc[key]) acc[key] = { supplier: r.supplier, items: 0, leadTimes: [] };
    acc[key].items += 1;
    if (typeof r.leadTime === 'number') acc[key].leadTimes.push(r.leadTime);
    return acc;
  }, {});

  const analysis = Object.values(bySupplier).map(s => ({
    supplier: s.supplier,
    items: s.items,
    avgLeadTime: s.leadTimes.length ? s.leadTimes.reduce((a, b) => a + b, 0) / s.leadTimes.length : null,
    p90LeadTime: s.leadTimes.length ? percentile(s.leadTimes, 0.9) : null
  }));

  return { analysis };
}

async function getOnTimeDeliveryLeaderboard({ tenantId, period = 180, limit = 10 }) {
  if (!tenantId) throw new ValidationError('tenantId is required');

  const since = new Date();
  since.setDate(since.getDate() - period);

  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId, createdAt: { gte: since }, expectedAt: { not: null }, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] } },
    include: { supplier: { select: { id: true, name: true } } }
  });

  const bySupplier = orders.reduce((acc, po) => {
    const key = po.supplierId;
    if (!acc[key]) acc[key] = { supplier: po.supplier, total: 0, onTime: 0 };
    acc[key].total += 1;
    if (po.updatedAt <= po.expectedAt) acc[key].onTime += 1;
    return acc;
  }, {});

  const leaderboard = Object.values(bySupplier)
    .map(s => ({ supplier: s.supplier, onTimeRate: s.total ? (s.onTime / s.total) * 100 : 0, orders: s.total }))
    .sort((a, b) => b.onTimeRate - a.onTimeRate)
    .slice(0, limit);

  return { leaderboard };
}

async function getSupplierPortfolioOverlap({ tenantId, minOverlapPercentage = 40 }) {
  if (!tenantId) throw new ValidationError('tenantId is required');

  const relations = await prisma.itemSupplier.findMany({
    where: { item: { tenantId } },
    select: { supplierId: true, itemId: true },
    orderBy: { supplierId: 'asc' }
  });

  const map = relations.reduce((acc, r) => {
    if (!acc[r.supplierId]) acc[r.supplierId] = new Set();
    acc[r.supplierId].add(r.itemId);
    return acc;
  }, {});

  const supplierIds = Object.keys(map);
  const overlaps = [];
  for (let i = 0; i < supplierIds.length; i++) {
    for (let j = i + 1; j < supplierIds.length; j++) {
      const a = supplierIds[i];
      const b = supplierIds[j];
      const setA = map[a];
      const setB = map[b];
      const common = [...setA].filter(x => setB.has(x)).length;
      const overlap = (common / Math.min(setA.size, setB.size)) * 100;
      if (overlap >= minOverlapPercentage) {
        overlaps.push({ supplierA: a, supplierB: b, overlapPercentage: overlap, commonItems: common });
      }
    }
  }

  // Hydrate supplier details
  const supplierDetails = await prisma.supplier.findMany({
    where: { id: { in: [...new Set(overlaps.flatMap(o => [o.supplierA, o.supplierB]))] } },
    select: { id: true, name: true }
  });
  const idToSupplier = supplierDetails.reduce((m, s) => (m[s.id] = s, m), {});
  const detailed = overlaps.map(o => ({
    supplier1: idToSupplier[o.supplierA],
    supplier2: idToSupplier[o.supplierB],
    overlapPercentage: o.overlapPercentage,
    commonItems: o.commonItems
  }));

  return { overlaps: detailed };
}

async function getSavingsOpportunitiesFromAlternatives({ tenantId, sinceDays = 90 }) {
  if (!tenantId) throw new ValidationError('tenantId is required');

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  // Recent POs
  const pos = await prisma.purchaseOrder.findMany({
    where: { tenantId, createdAt: { gte: since } },
    include: { items: true, supplier: true }
  });

  const suggestions = [];
  for (const po of pos) {
    for (const it of po.items) {
      const alternatives = await prisma.itemSupplier.findMany({
        where: { itemId: it.itemId, supplierId: { not: po.supplierId } },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { cost: 'asc' }
      });
      if (alternatives.length && parseFloat(alternatives[0].cost) < parseFloat(it.unitCost)) {
        const best = alternatives[0];
        const delta = (parseFloat(it.unitCost) - parseFloat(best.cost)) * parseFloat(it.quantity);
        if (delta > 0) {
          suggestions.push({
            purchaseOrderId: po.id,
            itemId: it.itemId,
            currentSupplier: po.supplier.name,
            alternativeSupplier: best.supplier.name,
            currentUnitCost: parseFloat(it.unitCost),
            alternativeUnitCost: parseFloat(best.cost),
            quantity: parseFloat(it.quantity),
            potentialSavings: delta
          });
        }
      }
    }
  }

  suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings);
  return { suggestions };
}

async function getABCClassificationOfSuppliers({ tenantId, period = 180 }) {
  if (!tenantId) throw new ValidationError('tenantId is required');
  const since = new Date();
  since.setDate(since.getDate() - period);

  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId, createdAt: { gte: since } },
    include: { items: true, supplier: { select: { id: true, name: true } } }
  });

  const totals = orders.reduce((acc, po) => {
    const value = po.items.reduce((s, it) => s + parseFloat(it.quantity) * parseFloat(it.unitCost), 0);
    acc[po.supplierId] = (acc[po.supplierId] || 0) + value;
    return acc;
  }, {});

  const rows = Object.entries(totals).map(([supplierId, totalValue]) => ({ supplierId, totalValue }));
  rows.sort((a, b) => b.totalValue - a.totalValue);

  const grandTotal = rows.reduce((s, r) => s + r.totalValue, 0) || 1;
  let cumulative = 0;
  const classified = rows.map(r => {
    cumulative += r.totalValue;
    const share = (cumulative / grandTotal) * 100;
    const cls = share <= 80 ? 'A' : share <= 95 ? 'B' : 'C';
    return { ...r, cumulativeShare: share, class: cls };
  });

  const suppliers = await prisma.supplier.findMany({ where: { id: { in: classified.map(c => c.supplierId) } }, select: { id: true, name: true } });
  const idToSupplier = suppliers.reduce((m, s) => (m[s.id] = s, m), {});

  return {
    classification: classified.map(c => ({ supplier: idToSupplier[c.supplierId], totalValue: c.totalValue, cumulativeShare: c.cumulativeShare, class: c.class })),
    period,
    grandTotal
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const arr = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(p * (arr.length - 1))));
  return arr[idx];
}

module.exports = {
  getCostTrendsBySupplier,
  compareSupplierCostsForItem,
  getLeadTimeAnalysis,
  getOnTimeDeliveryLeaderboard,
  getSupplierPortfolioOverlap,
  getSavingsOpportunitiesFromAlternatives,
  getABCClassificationOfSuppliers
};


