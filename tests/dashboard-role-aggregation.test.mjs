import test from "node:test";
import assert from "node:assert/strict";
import { scopedDashboard } from "../backend/dashboard-role-aggregation.mjs";

const leads = [
  { id: 1, tenantId: "A", ownerId: "u1", stage: "lead", status: "open" },
  { id: 2, tenantId: "A", ownerId: "u2", stage: "negotiation", status: "lost" },
  { id: 3, tenantId: "B", ownerId: "u1", stage: "proposal", status: "open" }
];
const sales = [
  { tenantId: "A", ownerId: "u1", status: "won", amount: 100 },
  { tenantId: "A", ownerId: "u2", status: "won", amount: 200 },
  { tenantId: "B", ownerId: "u1", status: "won", amount: 9000 }
];
const agent = { authenticated: true, tenantId: "A", userId: "u1", role: "agent" };
const manager = { ...agent, role: "manager" };

test("agent sees own metrics and never other tenants", () => {
  const result = scopedDashboard({ session: agent, leads, sales, target: 200, now: "2026-10-30" });
  assert.equal(result.leadCount, 1);
  assert.equal(result.wonCount, 1);
  assert.equal(result.revenue, 100);
  assert.equal(result.targetAchievementPct, 50);
});
test("manager sees whole tenant without cross-tenant leakage", () => {
  const result = scopedDashboard({ session: manager, leads, sales });
  assert.equal(result.leadCount, 2);
  assert.equal(result.lostCount, 1);
  assert.equal(result.revenue, 300);
});
test("rejects anonymous, unauthorized roles, and tenant mismatch", () => {
  assert.throws(() => scopedDashboard({ leads, sales }), { status: 401 });
  assert.throws(() => scopedDashboard({ session: { ...agent, role: "visitor" }, leads, sales }), { status: 403 });
  assert.throws(() => scopedDashboard({ session: agent, tenantId: "B", leads, sales }), { status: 403 });
});
