import mongoose from 'mongoose';

/**
 * Persists the exact shape `reconciliationService.runReconciliation()` already
 * returns, once a day, so scheduled reconciliation (plan.md §29.3) leaves a
 * durable trail instead of only ever existing as a request/response for
 * whoever happens to call the admin endpoint at the right moment.
 */
const reconciliationReportSchema = new mongoose.Schema({
    generatedAt: { type: Date, required: true },
    durationMs: { type: Number },
    healthy: { type: Boolean, required: true },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    balanceDrift: { type: mongoose.Schema.Types.Mixed, default: [] },
    orphanedLegs: { type: mongoose.Schema.Types.Mixed, default: [] },
    payments: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Set once the unhealthy-admin-alert notification has actually been sent, for this day's dedupe. */
    alertedAt: { type: Date, default: null },
}, { timestamps: true });

reconciliationReportSchema.index({ generatedAt: -1 });

export default mongoose.model('ReconciliationReport', reconciliationReportSchema);
