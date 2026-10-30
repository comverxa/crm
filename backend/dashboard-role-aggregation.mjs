/**
 * COMVERXA dashboard aggregation contract.
 * Pure functions: no database access and no side effects.
 * IMPORTANT: caller MUST apply server-side tenant/user authorization before passing records.
 */
export function aggregateDashboard({ sales = [], leads = [], target = 0, now = new Date() } = {}) {
  const safeAmount = (x) => Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0;
  const wins = sales.filter(s => s.status === "won");
  const lost = leads.filter(l => l.status === "lost");
  const revenue = wins.reduce((sum, sale) => sum + safeAmount(sale.amount), 0);
  const pipeline = ["lead", "contact", "negotiation", "proposal", "closed"];
  const stages = Object.fromEntries(pipeline.map(stage => [stage, leads.filter(l => l.stage === stage).length]));
  const totalLeads = leads.length;
  const conversionRate = totalLeads ? Math.round(wins.length / totalLeads * 10000) / 100 : 0;
  const monthlyTarget = safeAmount(target);
  return {
    updatedAt: new Date(now).toISOString(),
    leadCount: totalLeads,
    wonCount: wins.length,
    lostCount: lost.length,
    revenue,
    monthlyTarget,
    targetAchievementPct: monthlyTarget ? Math.round(revenue / monthlyTarget * 10000) / 100 : null,
    conversionRate,
    stages
  };
}
/**
 * Enforces a fixed tenant boundary and salesperson boundary. Do NOT trust role,
 * tenantId or userId from request body/query; obtain from verified server session.
 * This helper is defense-in-depth and not a substitute for SQL WHERE tenant_id = ?.
 */
export function scopedDashboard({ session, tenantId, leads = [], sales = [], target = 0, now } = {}) {
  if (!session || !session.authenticated || !session.userId || !session.tenantId) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  if (!["agent", "manager", "owner"].includes(session.role)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  if (tenantId && String(tenantId) !== String(session.tenantId)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  const inScope = row => row && String(row.tenantId) === String(session.tenantId)
    && (session.role !== "agent" || String(row.ownerId) === String(session.userId));
  return aggregateDashboard({
    leads: leads.filter(inScope),
    sales: sales.filter(inScope),
    target,
    now
  });
}
