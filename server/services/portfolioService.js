import Holding, { ASSET_TYPES } from '../models/Holding.js';
import Liability, { LIABILITY_KINDS } from '../models/Liability.js';
import User from '../models/User.js';
import { parseAmount, toPaise, fromPaise, balanceMinorOf } from '../utils/money.js';
import { DomainError } from '../utils/domainError.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';

/**
 * Self-reported holdings and debts (plan.md §21, §22), and the net worth they
 * add up to.
 *
 * Every number here is what the holder typed. There is no price feed, no
 * execution, no advice, no credit bureau and no lending — the product owner's
 * 2026-09-27 decision was to build the trackers and nothing that would make
 * them a regulated service. Nothing in this module touches the ledger, and the
 * only balance it reads is the wallet's own, for the net-worth line.
 */

export const MAX_HOLDINGS = 100;
export const MAX_LIABILITIES = 50;

const str = (value, max) => (typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null);

/**
 * Money fields may be zero here (a fully written-down holding, a paid-off
 * card), which `parseAmount` rejects, so zero is allowed explicitly.
 */
const money = (raw, label, { required = true } = {}) => {
    if (raw === undefined || raw === null || raw === '') {
        if (required) throw new DomainError('INVALID_AMOUNT', `${label} is required`, 400);
        return null;
    }
    if (Number(raw) === 0 && typeof raw !== 'object') return 0;
    const parsed = parseAmount(raw);
    if (!parsed.ok) throw new DomainError('INVALID_AMOUNT', `${label}: ${parsed.error.toLowerCase()}`, 400);
    return toPaise(parsed.value);
};

const withRupees = (doc, fields) => ({
    ...doc,
    ...Object.fromEntries(fields.map((f) => [f.replace(/Minor$/, ''), doc[f] == null ? null : fromPaise(doc[f])])),
});

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

const parseHolding = (body = {}, { partial = false } = {}) => {
    const out = {};
    if (!partial || body.assetType !== undefined) {
        if (!ASSET_TYPES.includes(body.assetType)) throw new DomainError('INVALID_TYPE', 'Choose what kind of investment this is', 400);
        out.assetType = body.assetType;
    }
    if (!partial || body.name !== undefined) {
        const name = str(body.name, 120);
        if (!name) throw new DomainError('INVALID_NAME', 'Give this holding a name', 400);
        out.name = name;
    }
    if (body.identifier !== undefined) out.identifier = str(body.identifier, 40) || '';
    if (body.notes !== undefined) out.notes = str(body.notes, 500) || '';
    if (body.units !== undefined) {
        if (body.units === null || body.units === '') out.units = null;
        else {
            const units = Number(body.units);
            if (!Number.isFinite(units) || units < 0 || units > 1e12) throw new DomainError('INVALID_UNITS', 'Units must be a positive number', 400);
            out.units = Number(units.toFixed(6));
        }
    }
    if (!partial || body.costBasis !== undefined) out.costBasisMinor = money(body.costBasis, 'Amount invested');
    if (!partial || body.currentValue !== undefined) {
        out.currentValueMinor = money(body.currentValue, 'Current value');
        out.valueUpdatedAt = new Date();
    }
    return out;
};

const holdingView = (h) => {
    const view = withRupees(h, ['costBasisMinor', 'currentValueMinor']);
    view.gainMinor = h.currentValueMinor - h.costBasisMinor;
    view.gain = fromPaise(view.gainMinor);
    view.gainPercent = h.costBasisMinor > 0 ? Number(((view.gainMinor / h.costBasisMinor) * 100).toFixed(2)) : null;
    return view;
};

export const listHoldings = async (userId) =>
    (await Holding.find({ userId, archivedAt: null }).sort({ assetType: 1, name: 1 }).lean()).map(holdingView);

export const createHolding = async (userId, body, { req } = {}) => {
    if (await Holding.countDocuments({ userId, archivedAt: null }) >= MAX_HOLDINGS) {
        throw new DomainError('TOO_MANY', `You can track up to ${MAX_HOLDINGS} holdings`, 409);
    }
    const holding = await Holding.create({ userId, ...parseHolding(body) });
    audit(AUDIT.HOLDING_SAVED, { userId, req, target: { type: 'Holding', id: String(holding._id) }, metadata: { assetType: holding.assetType, created: true } });
    return holdingView(holding.toObject());
};

export const updateHolding = async (userId, id, body, { req } = {}) => {
    const update = parseHolding(body, { partial: true });
    if (!Object.keys(update).length) throw new DomainError('NOTHING_TO_UPDATE', 'Nothing to update', 400);
    const holding = await Holding.findOneAndUpdate({ _id: id, userId, archivedAt: null }, { $set: update }, { new: true, runValidators: true }).lean();
    if (!holding) throw new DomainError('NOT_FOUND', 'Holding not found', 404);
    audit(AUDIT.HOLDING_SAVED, { userId, req, target: { type: 'Holding', id: String(id) }, metadata: { fields: Object.keys(update) } });
    return holdingView(holding);
};

export const removeHolding = async (userId, id, { req } = {}) => {
    const result = await Holding.updateOne({ _id: id, userId, archivedAt: null }, { $set: { archivedAt: new Date() } });
    if (!result.matchedCount) throw new DomainError('NOT_FOUND', 'Holding not found', 404);
    audit(AUDIT.HOLDING_REMOVED, { userId, req, target: { type: 'Holding', id: String(id) } });
};

// ---------------------------------------------------------------------------
// Liabilities
// ---------------------------------------------------------------------------

const parseLiability = (body = {}, { partial = false } = {}) => {
    const out = {};
    if (!partial || body.kind !== undefined) {
        if (!LIABILITY_KINDS.includes(body.kind)) throw new DomainError('INVALID_KIND', 'Choose what kind of debt this is', 400);
        out.kind = body.kind;
    }
    if (!partial || body.lender !== undefined) {
        const lender = str(body.lender, 120);
        if (!lender) throw new DomainError('INVALID_LENDER', 'Who is the lender?', 400);
        out.lender = lender;
    }
    if (!partial || body.outstanding !== undefined) {
        out.outstandingMinor = money(body.outstanding, 'Amount outstanding');
        out.outstandingUpdatedAt = new Date();
    }
    if (body.emi !== undefined) out.emiMinor = money(body.emi, 'EMI', { required: false });
    if (body.interestRate !== undefined) {
        if (body.interestRate === null || body.interestRate === '') out.interestRate = null;
        else {
            const rate = Number(body.interestRate);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new DomainError('INVALID_RATE', 'Interest rate must be between 0 and 100', 400);
            out.interestRate = Number(rate.toFixed(2));
        }
    }
    if (body.emiDueDay !== undefined) {
        if (body.emiDueDay === null || body.emiDueDay === '') out.emiDueDay = null;
        else {
            const day = Number(body.emiDueDay);
            if (!Number.isInteger(day) || day < 1 || day > 28) throw new DomainError('INVALID_DAY', 'EMI day must be between 1 and 28', 400);
            out.emiDueDay = day;
        }
    }
    if (body.endDate !== undefined) {
        if (!body.endDate) out.endDate = null;
        else {
            const date = new Date(body.endDate);
            if (Number.isNaN(date.getTime())) throw new DomainError('INVALID_DATE', 'Enter a valid end date', 400);
            out.endDate = date;
        }
    }
    if (body.notes !== undefined) out.notes = str(body.notes, 500) || '';
    return out;
};

const liabilityView = (l) => withRupees(l, ['outstandingMinor', 'emiMinor']);

export const listLiabilities = async (userId) =>
    (await Liability.find({ userId, archivedAt: null }).sort({ outstandingMinor: -1 }).lean()).map(liabilityView);

export const createLiability = async (userId, body, { req } = {}) => {
    if (await Liability.countDocuments({ userId, archivedAt: null }) >= MAX_LIABILITIES) {
        throw new DomainError('TOO_MANY', `You can track up to ${MAX_LIABILITIES} debts`, 409);
    }
    const liability = await Liability.create({ userId, ...parseLiability(body) });
    audit(AUDIT.LIABILITY_SAVED, { userId, req, target: { type: 'Liability', id: String(liability._id) }, metadata: { kind: liability.kind, created: true } });
    return liabilityView(liability.toObject());
};

export const updateLiability = async (userId, id, body, { req } = {}) => {
    const update = parseLiability(body, { partial: true });
    if (!Object.keys(update).length) throw new DomainError('NOTHING_TO_UPDATE', 'Nothing to update', 400);
    const liability = await Liability.findOneAndUpdate({ _id: id, userId, archivedAt: null }, { $set: update }, { new: true, runValidators: true }).lean();
    if (!liability) throw new DomainError('NOT_FOUND', 'Debt not found', 404);
    audit(AUDIT.LIABILITY_SAVED, { userId, req, target: { type: 'Liability', id: String(id) }, metadata: { fields: Object.keys(update) } });
    return liabilityView(liability);
};

export const removeLiability = async (userId, id, { req } = {}) => {
    const result = await Liability.updateOne({ _id: id, userId, archivedAt: null }, { $set: { archivedAt: new Date() } });
    if (!result.matchedCount) throw new DomainError('NOT_FOUND', 'Debt not found', 404);
    audit(AUDIT.LIABILITY_REMOVED, { userId, req, target: { type: 'Liability', id: String(id) } });
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Totals, allocation and net worth. Pure over its inputs so the arithmetic is
 * testable without a database. Everything is summed in integer paise.
 */
export const summarise = ({ holdings, liabilities, walletMinor }) => {
    const investedMinor = holdings.reduce((sum, h) => sum + h.costBasisMinor, 0);
    const holdingsValueMinor = holdings.reduce((sum, h) => sum + h.currentValueMinor, 0);
    const liabilitiesMinor = liabilities.reduce((sum, l) => sum + l.outstandingMinor, 0);
    const monthlyEmiMinor = liabilities.reduce((sum, l) => sum + (l.emiMinor ?? 0), 0);

    const byType = new Map();
    for (const h of holdings) byType.set(h.assetType, (byType.get(h.assetType) ?? 0) + h.currentValueMinor);
    const allocation = [...byType.entries()]
        .map(([assetType, valueMinor]) => ({
            assetType,
            valueMinor,
            value: fromPaise(valueMinor),
            // One decimal is enough to read, and keeps a 0.04% slice from showing as "0%".
            percent: holdingsValueMinor > 0 ? Number(((valueMinor / holdingsValueMinor) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.valueMinor - a.valueMinor);

    const oldest = holdings.reduce((min, h) => (!min || new Date(h.valueUpdatedAt) < min ? new Date(h.valueUpdatedAt) : min), null);
    const netWorthMinor = holdingsValueMinor + walletMinor - liabilitiesMinor;

    return {
        investedMinor,
        invested: fromPaise(investedMinor),
        holdingsValueMinor,
        holdingsValue: fromPaise(holdingsValueMinor),
        gainMinor: holdingsValueMinor - investedMinor,
        gain: fromPaise(holdingsValueMinor - investedMinor),
        gainPercent: investedMinor > 0 ? Number((((holdingsValueMinor - investedMinor) / investedMinor) * 100).toFixed(2)) : null,
        liabilitiesMinor,
        liabilities: fromPaise(liabilitiesMinor),
        monthlyEmiMinor,
        monthlyEmi: fromPaise(monthlyEmiMinor),
        walletMinor,
        wallet: fromPaise(walletMinor),
        netWorthMinor,
        netWorth: fromPaise(netWorthMinor),
        allocation,
        /** The stalest self-reported value, so the UI can say "values as of …". */
        oldestValueAt: oldest,
        holdingCount: holdings.length,
        liabilityCount: liabilities.length,
    };
};

export const getSummary = async (userId) => {
    const [holdings, liabilities, user] = await Promise.all([
        Holding.find({ userId, archivedAt: null }).select('assetType costBasisMinor currentValueMinor valueUpdatedAt').lean(),
        Liability.find({ userId, archivedAt: null }).select('outstandingMinor emiMinor').lean(),
        User.findById(userId).select('balanceMinor').lean(),
    ]);
    return summarise({ holdings, liabilities, walletMinor: balanceMinorOf(user) });
};

export default {
    listHoldings, createHolding, updateHolding, removeHolding,
    listLiabilities, createLiability, updateLiability, removeLiability,
    summarise, getSummary,
};
