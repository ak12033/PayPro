import crypto from 'crypto';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AmlAlert from '../models/AmlAlert.js';
import Watchlist from '../models/Watchlist.js';
import WatchlistEntry from '../models/WatchlistEntry.js';
import KycSubmission from '../models/KycSubmission.js';
import BankAccount from '../models/BankAccount.js';
import { securityConfig } from '../config/security.js';
import { AMOUNT_MINOR_EXPR, fromPaise } from '../utils/money.js';
import { startOfDayIST } from '../utils/period.js';
import { TX_STATUS, HOLD_SOURCES, HOLD_STATUSES } from '../constants/transactionStatus.js';
import { DomainError } from '../utils/domainError.js';
import { notifyUser } from './notificationService.js';
import { audit } from './auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * AML transaction monitoring and watchlist screening (plan.md §30.3, §0.20.3).
 *
 * **Shadow mode, by construction.** Nothing in this module returns a verdict to
 * a money path, and nothing on a money path waits for it: `monitorAfterMovement`
 * is called after settlement, fire-and-forget, and swallows its own failures.
 * The output is an `AmlAlert` in a review queue and a log line. Turning any of
 * this into a block is a legal decision (§41.3) and would be a separate change,
 * made on purpose.
 *
 * Split like `transactionRiskService`: `evaluateAml` is pure (signals in, rule
 * hits out) so every rule is unit-testable without a database;
 * `gatherAmlSignals` does the reading.
 */

const HOUR_MS = 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

/** `YYYY-MM-DD` of the IST day containing `date` — the dedupe window for daily rules. */
export const istDayKey = (date = new Date()) =>
    new Date(startOfDayIST(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const inr = (minor) => `₹${fromPaise(minor).toLocaleString('en-IN')}`;

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/**
 * @param {object} s  signals from `gatherAmlSignals`
 * @param {object} cfg `securityConfig.aml`
 * @returns {Array<{rule, severity, detail, evidence}>}
 */
export const evaluateAml = (s, cfg = securityConfig.aml) => {
    const hits = [];
    const windowHours = cfg.windowHours;

    // STRUCTURING — several movements each just under a threshold.
    const { thresholdMinor, bandFraction, minCount } = cfg.structuring;
    const floor = Math.ceil(thresholdMinor * bandFraction);
    const nearThreshold = s.movements.filter((m) => m.amountMinor >= floor && m.amountMinor < thresholdMinor);
    if (nearThreshold.length >= minCount) {
        hits.push({
            rule: 'STRUCTURING',
            severity: 'high',
            detail: `${nearThreshold.length} movements between ${inr(floor)} and ${inr(thresholdMinor)} in ${windowHours}h.`,
            evidence: {
                windowHours,
                count: nearThreshold.length,
                totalMinor: nearThreshold.reduce((sum, m) => sum + m.amountMinor, 0),
                transactionIds: nearThreshold.slice(0, 20).map((m) => m.id),
            },
        });
    }

    // RAPID_IN_OUT — money arrives and most of it leaves again quickly.
    const rapid = cfg.rapidInOut;
    if (s.rapid.inflowMinor >= rapid.minInflowMinor
        && s.rapid.outflowMinor >= Math.ceil(s.rapid.inflowMinor * rapid.outflowFraction)
        && s.rapid.firstInflowAt && s.rapid.lastOutflowAt
        && s.rapid.lastOutflowAt > s.rapid.firstInflowAt) {
        hits.push({
            rule: 'RAPID_IN_OUT',
            severity: 'medium',
            detail: `${inr(s.rapid.inflowMinor)} came in and ${inr(s.rapid.outflowMinor)} went out within ${rapid.windowMinutes} minutes.`,
            evidence: {
                windowHours: rapid.windowMinutes / 60,
                totalMinor: s.rapid.outflowMinor,
                transactionIds: s.rapid.transactionIds.slice(0, 20),
            },
        });
    }

    // FAN_IN / FAN_OUT — many distinct counterparties.
    if (s.distinctSenders >= cfg.fanIn.minCounterparties) {
        hits.push({
            rule: 'FAN_IN',
            severity: 'medium',
            detail: `Received transfers from ${s.distinctSenders} different accounts in ${windowHours}h.`,
            evidence: { windowHours, counterpartyCount: s.distinctSenders, totalMinor: s.inboundTransferMinor },
        });
    }
    if (s.distinctRecipients >= cfg.fanOut.minCounterparties) {
        hits.push({
            rule: 'FAN_OUT',
            severity: 'medium',
            detail: `Sent transfers to ${s.distinctRecipients} different accounts in ${windowHours}h.`,
            evidence: { windowHours, counterpartyCount: s.distinctRecipients, totalMinor: s.outboundMinor },
        });
    }

    // HIGH_VELOCITY — a lot out, by count or by value.
    const { maxCount, maxVolumeMinor } = cfg.velocity;
    if (s.outboundCount >= maxCount || s.outboundMinor >= maxVolumeMinor) {
        hits.push({
            rule: 'HIGH_VELOCITY',
            severity: s.outboundMinor >= maxVolumeMinor * 2 ? 'high' : 'low',
            detail: `${s.outboundCount} outgoing movements totalling ${inr(s.outboundMinor)} in ${windowHours}h.`,
            evidence: { windowHours, count: s.outboundCount, totalMinor: s.outboundMinor },
        });
    }

    return hits;
};

// ---------------------------------------------------------------------------
// Signal gathering
// ---------------------------------------------------------------------------

/**
 * Rows that are real money movement for AML purposes: settled, and either
 * SUCCESS or a hold whose money has already left (a pending withdrawal is
 * exactly the "out" in rapid in-and-out). Manual notes and adjustments are not
 * the customer moving money and are excluded.
 */
const movementMatch = (userId, since) => ({
    userId: new mongoose.Types.ObjectId(userId),
    settlement: 'settled',
    source: { $nin: ['manual', 'adjustment'] },
    createdAt: { $gte: since },
    $or: [
        { status: TX_STATUS.SUCCESS },
        { source: { $in: HOLD_SOURCES }, status: { $in: HOLD_STATUSES } },
    ],
});

export const gatherAmlSignals = async (userId, { now = new Date(), cfg = securityConfig.aml } = {}) => {
    const since = new Date(now.getTime() - cfg.windowHours * HOUR_MS);
    const rapidSince = new Date(now.getTime() - cfg.rapidInOut.windowMinutes * 60 * 1000);

    const rows = await Transaction.aggregate([
        { $match: movementMatch(userId, since) },
        { $sort: { createdAt: 1 } },
        { $limit: 2000 },
        {
            $project: {
                type: 1, category: 1, source: 1, createdAt: 1,
                counterpartyId: '$counterparty.userId',
                amountMinor: AMOUNT_MINOR_EXPR,
            },
        },
    ]);

    const movements = rows.map((r) => ({ id: r._id, amountMinor: r.amountMinor, type: r.type }));
    const outbound = rows.filter((r) => r.type === 'Debit');
    const inboundTransfers = rows.filter((r) => r.type === 'Credit' && r.category === 'Transfer');
    const distinct = (list) => new Set(list.map((r) => String(r.counterpartyId || '')).filter(Boolean)).size;

    const rapidRows = rows.filter((r) => r.createdAt >= rapidSince);
    const rapidIn = rapidRows.filter((r) => r.type === 'Credit');
    const rapidOut = rapidRows.filter((r) => r.type === 'Debit');

    return {
        movements,
        outboundCount: outbound.length,
        outboundMinor: outbound.reduce((sum, r) => sum + r.amountMinor, 0),
        inboundTransferMinor: inboundTransfers.reduce((sum, r) => sum + r.amountMinor, 0),
        distinctSenders: distinct(inboundTransfers),
        distinctRecipients: distinct(outbound.filter((r) => r.category === 'Transfer')),
        rapid: {
            inflowMinor: rapidIn.reduce((sum, r) => sum + r.amountMinor, 0),
            outflowMinor: rapidOut.reduce((sum, r) => sum + r.amountMinor, 0),
            firstInflowAt: rapidIn[0]?.createdAt ?? null,
            lastOutflowAt: rapidOut.at(-1)?.createdAt ?? null,
            transactionIds: rapidRows.map((r) => r._id),
        },
    };
};

// ---------------------------------------------------------------------------
// Raising alerts
// ---------------------------------------------------------------------------

/**
 * Write one alert unless the same (user, dedupeKey) already exists. A duplicate
 * is the expected outcome of a rule that keeps firing, not an error.
 */
export const raiseAlert = async ({ userId, rule, severity, detail, evidence, dedupeKey }) => {
    try {
        const alert = await AmlAlert.create({ userId, rule, severity, detail, evidence, dedupeKey });
        audit(AUDIT.AML_ALERT_RAISED, {
            userId,
            target: { type: 'AmlAlert', id: String(alert._id) },
            metadata: { rule, severity, mode: 'shadow' },
        });
        logger.warn('AML alert raised (shadow mode)', { rule, severity, alertId: String(alert._id), targetUserId: String(userId) });

        if (severity === 'high') {
            const reviewers = await User.find({ role: { $in: ['admin', 'risk'] }, status: 'active' }).select('_id').lean();
            await Promise.allSettled(reviewers.map((reviewer) => notifyUser(
                reviewer._id, 'System', 'High-severity AML alert',
                `${rule.replace(/_/g, ' ').toLowerCase()}: ${detail}`,
                { amlAlertId: String(alert._id) },
                { dedupeKey: `aml-alert:${alert._id}` }
            )));
        }
        return alert;
    } catch (err) {
        if (err?.code === 11000) return null;
        throw err;
    }
};

/**
 * Evaluate one account now and raise whatever fires. Returns the new alerts.
 */
export const monitorUser = async (userId, { now = new Date() } = {}) => {
    const signals = await gatherAmlSignals(userId, { now });
    const day = istDayKey(now);
    const raised = [];
    for (const hit of evaluateAml(signals)) {
        const alert = await raiseAlert({ userId, ...hit, dedupeKey: `${hit.rule}:${day}` });
        if (alert) raised.push(alert);
    }
    return raised;
};

/**
 * The hook money paths call after they settle. Never throws and is never
 * awaited by a caller that is holding a response: monitoring must not be able
 * to slow down or fail a payment.
 */
export const monitorAfterMovement = (userIds, context = {}) => {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    return Promise.all(ids.map((id) => monitorUser(id).catch((err) => {
        logger.error('AML monitoring failed for one account', { err, targetUserId: id, trigger: context.trigger });
        return [];
    })));
};

/**
 * The nightly sweep: every account that moved money in the last window, so a
 * pattern built out of movements that each looked fine at the time is still
 * seen once the day is complete.
 */
export const sweepRecentActivity = async ({ now = new Date() } = {}) => {
    const since = new Date(now.getTime() - securityConfig.aml.windowHours * HOUR_MS);
    const userIds = await Transaction.distinct('userId', { createdAt: { $gte: since }, settlement: 'settled' });
    let raised = 0;
    for (const userId of userIds) {
        try {
            raised += (await monitorUser(userId, { now })).length;
        } catch (err) {
            logger.error('AML sweep failed for one account', { err, targetUserId: String(userId) });
        }
    }
    return { considered: userIds.length, raised };
};

// ---------------------------------------------------------------------------
// Shared identifiers
// ---------------------------------------------------------------------------

/** The same PAN on more than one account. Raised against the account that just submitted. */
export const checkSharedPan = async ({ userId, panFingerprint }) => {
    if (!panFingerprint) return null;
    const others = await KycSubmission.find({ 'identifiers.panFingerprint': panFingerprint, userId: { $ne: userId } }).select('userId').limit(10).lean();
    if (!others.length) return null;
    return raiseAlert({
        userId,
        rule: 'SHARED_IDENTIFIER',
        severity: 'high',
        detail: `The PAN on this KYC submission is also on ${others.length} other account(s).`,
        evidence: { otherUserIds: others.map((o) => o.userId), counterpartyCount: others.length },
        dedupeKey: `SHARED_IDENTIFIER:pan:${panFingerprint.slice(0, 16)}`,
    });
};

/** The same bank account added by more than one customer — a classic mule pattern. */
export const checkSharedBankAccount = async ({ userId, accountNumberFingerprint }) => {
    const others = await BankAccount.find({
        accountNumberFingerprint, userId: { $ne: userId }, status: { $ne: 'removed' },
    }).select('userId').limit(10).lean();
    if (!others.length) return null;
    return raiseAlert({
        userId,
        rule: 'SHARED_IDENTIFIER',
        severity: 'medium',
        detail: `This bank account has also been added by ${others.length} other account(s).`,
        evidence: { otherUserIds: others.map((o) => o.userId), counterpartyCount: others.length },
        dedupeKey: `SHARED_IDENTIFIER:bank:${accountNumberFingerprint.slice(0, 16)}`,
    });
};

// ---------------------------------------------------------------------------
// Watchlist screening
// ---------------------------------------------------------------------------

/**
 * Normalise a name for comparison: accents removed, lower case, punctuation to
 * spaces, tokens sorted. "SMITH, John" and "john  smith" give the same key.
 * Deliberately exact after normalisation — no fuzzy matching. A reviewer has to
 * be able to see *why* two names matched, and "edit distance 2" is not a reason
 * a person can check.
 */
export const nameTokens = (name) => String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export const nameKey = (name) => nameTokens(name).sort().join(' ');

/**
 * The keys a candidate name can match on: the full name, plus — for names of
 * three or more parts — the name with any one part left out, so "John Michael
 * Smith" is found on a list entry for "John Smith". A list entry is never
 * shortened, only the candidate.
 */
export const candidateKeys = (name) => {
    const tokens = nameTokens(name);
    const keys = new Set([tokens.slice().sort().join(' ')]);
    if (tokens.length >= 3) {
        tokens.forEach((_, i) => keys.add(tokens.filter((__, j) => j !== i).sort().join(' ')));
    }
    return [...keys].filter(Boolean);
};

const sameDay = (a, b) => a && b && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

/**
 * Matches for one person against the active lists (or one given list).
 * Severity: name and date of birth both match → high; the entry has no date of
 * birth → medium; the dates differ → low (still raised, so a person decides).
 */
export const screenName = async ({ legalName, dateOfBirth, watchlistIds = null }) => {
    const keys = candidateKeys(legalName);
    if (!keys.length) return [];
    const lists = watchlistIds
        ? await Watchlist.find({ _id: { $in: watchlistIds } }).select('_id name').lean()
        : await Watchlist.find({ active: true }).select('_id name').lean();
    if (!lists.length) return [];

    const entries = await WatchlistEntry.find({ nameKey: { $in: keys }, watchlistId: { $in: lists.map((l) => l._id) } }).limit(50).lean();
    const listName = new Map(lists.map((l) => [String(l._id), l.name]));

    return entries.map((entry) => {
        let severity = 'medium';
        if (entry.dateOfBirth && dateOfBirth) severity = sameDay(entry.dateOfBirth, dateOfBirth) ? 'high' : 'low';
        return { entry, watchlistName: listName.get(String(entry.watchlistId)), severity };
    });
};

/**
 * Screen a KYC submission and record the result on it. Each match becomes a
 * WATCHLIST_MATCH alert, deduped per list entry so re-screening never
 * duplicates one.
 */
export const screenSubmission = async (submission, { watchlistIds = null } = {}) => {
    const matches = await screenName({
        legalName: submission.applicant?.legalName,
        dateOfBirth: submission.applicant?.dateOfBirth,
        watchlistIds,
    });

    for (const match of matches) {
        await raiseAlert({
            userId: submission.userId,
            rule: 'WATCHLIST_MATCH',
            severity: match.severity,
            detail: `KYC legal name matches "${match.entry.name}" on ${match.watchlistName}${match.entry.reference ? ` (${match.entry.reference})` : ''}.${match.severity === 'low' ? ' Dates of birth differ.' : ''}`,
            evidence: { watchlistEntryId: match.entry._id, watchlistName: match.watchlistName, matchedName: match.entry.name },
            dedupeKey: `WATCHLIST_MATCH:${match.entry._id}`,
        });
    }

    const openMatches = await AmlAlert.countDocuments({ userId: submission.userId, rule: 'WATCHLIST_MATCH', status: 'open' });
    await KycSubmission.updateOne(
        { _id: submission._id },
        { $set: { 'screening.screenedAt': new Date(), 'screening.possibleMatches': openMatches } }
    );
    return matches;
};

/** Re-screen every submission against a newly imported list. */
export const rescreenAgainst = async (watchlistId) => {
    let screened = 0;
    let matched = 0;
    const cursor = KycSubmission.find({}).select('userId applicant').lean().cursor();
    for await (const submission of cursor) {
        const matches = await screenSubmission(submission, { watchlistIds: [watchlistId] });
        screened += 1;
        matched += matches.length;
    }
    return { screened, matched };
};

// ---------------------------------------------------------------------------
// Watchlist import
// ---------------------------------------------------------------------------

/** A small RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
export const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i += 1;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((cell) => cell.trim()));
};

export const MAX_WATCHLIST_ENTRIES = 50_000;

/**
 * Import a list from CSV text. The header row must include `name`; `date_of_birth`
 * (or `dob`, `YYYY-MM-DD`) and `reference` are optional. Creates the next
 * version under `name`, activates it and deactivates the previous version, then
 * re-screens every KYC submission against it.
 */
export const importWatchlist = async ({ name, source, csvText, actorId, req }) => {
    const rows = parseCsv(String(csvText ?? '').replace(/^﻿/, ''));
    if (rows.length < 2) throw new DomainError('EMPTY_LIST', 'The file needs a header row and at least one entry', 400);

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => header.findIndex((h) => names.includes(h));
    const nameCol = col('name', 'full_name', 'full name');
    if (nameCol === -1) throw new DomainError('NO_NAME_COLUMN', 'The header row must have a "name" column', 400);
    const dobCol = col('date_of_birth', 'dob', 'date of birth');
    const refCol = col('reference', 'ref', 'listing_id');

    const body = rows.slice(1);
    if (body.length > MAX_WATCHLIST_ENTRIES) {
        throw new DomainError('LIST_TOO_LARGE', `A list can have at most ${MAX_WATCHLIST_ENTRIES.toLocaleString('en-IN')} entries`, 413);
    }

    const entries = [];
    let skipped = 0;
    for (const cells of body) {
        const entryName = (cells[nameCol] ?? '').trim().slice(0, 200);
        const key = nameKey(entryName);
        if (!key) { skipped += 1; continue; }
        const rawDob = dobCol >= 0 ? (cells[dobCol] ?? '').trim() : '';
        const dob = /^\d{4}-\d{2}-\d{2}$/.test(rawDob) ? new Date(`${rawDob}T00:00:00.000Z`) : null;
        entries.push({
            name: entryName,
            nameKey: key,
            dateOfBirth: dob && !Number.isNaN(dob.getTime()) ? dob : null,
            reference: refCol >= 0 ? (cells[refCol] ?? '').trim().slice(0, 120) : '',
        });
    }
    if (!entries.length) throw new DomainError('EMPTY_LIST', 'No usable entries were found in the file', 400);

    const previous = await Watchlist.findOne({ name }).sort({ version: -1 }).lean();
    const list = await Watchlist.create({
        name,
        source,
        version: (previous?.version ?? 0) + 1,
        active: false,
        entryCount: entries.length,
        sha256: crypto.createHash('sha256').update(String(csvText)).digest('hex'),
        importedBy: actorId,
        skippedRows: skipped,
    });

    for (let i = 0; i < entries.length; i += 1000) {
        await WatchlistEntry.insertMany(entries.slice(i, i + 1000).map((e) => ({ ...e, watchlistId: list._id })), { ordered: false });
    }

    // Only once every entry is in: switch versions, so screening never runs
    // against a half-imported list.
    await Watchlist.updateMany({ name, _id: { $ne: list._id } }, { $set: { active: false } });
    await Watchlist.updateOne({ _id: list._id }, { $set: { active: true } });

    audit(AUDIT.AML_WATCHLIST_IMPORTED, {
        userId: actorId, req,
        target: { type: 'Watchlist', id: String(list._id) },
        metadata: { name, version: list.version, entries: entries.length, skipped, sha256: list.sha256 },
    });

    const rescreen = await rescreenAgainst(list._id);
    return { watchlist: { ...list.toObject(), active: true }, entries: entries.length, skipped, rescreen };
};

export const listWatchlists = () => Watchlist.find({}).sort({ name: 1, version: -1 })
    .populate('importedBy', 'firstName lastName email').lean();

// ---------------------------------------------------------------------------
// The review queue
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = ['high', 'medium', 'low'];

export const listAlerts = async ({ status = 'open', rule, page = 1, limit = 25 } = {}) => {
    const match = {};
    if (status !== 'all') match.status = status;
    if (rule) match.rule = rule;

    const [alerts, total] = await Promise.all([
        AmlAlert.aggregate([
            { $match: match },
            { $addFields: { severityRank: { $indexOfArray: [SEVERITY_ORDER, '$severity'] } } },
            { $sort: { severityRank: 1, createdAt: 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user', pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }] } },
            { $addFields: { userId: { $first: '$user' } } },
            { $project: { user: 0, severityRank: 0, reportDraft: 0 } },
        ]),
        AmlAlert.countDocuments(match),
    ]);
    return { alerts, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
};

export const getAlert = async (alertId) => {
    const alert = await AmlAlert.findById(alertId)
        .populate('userId', 'firstName lastName email status kycTier createdAt')
        .populate('reviewedBy', 'firstName lastName email')
        .populate('evidence.transactionIds', 'description amount amountMinor type category status source createdAt invoiceId')
        .lean();
    if (!alert) throw new DomainError('NOT_FOUND', 'Alert not found', 404);
    const others = await AmlAlert.find({ userId: alert.userId?._id, _id: { $ne: alert._id } })
        .sort({ createdAt: -1 }).limit(10).select('rule severity status disposition createdAt').lean();
    return { alert, otherAlerts: others };
};

export const listUserAlerts = (userId, { limit = 20 } = {}) =>
    AmlAlert.find({ userId }).sort({ createdAt: -1 }).limit(limit).select('rule severity status disposition detail createdAt').lean();

/**
 * Record a disposition. Compare-and-set on `status: 'open'`, so two reviewers
 * can never both close one alert. A report draft is internal, and only kept on a
 * `suspicious` disposition.
 */
export const closeAlert = async ({ alertId, actorId, disposition, notes, reportDraft = '', req }) => {
    const alert = await AmlAlert.findOneAndUpdate(
        { _id: alertId, status: 'open' },
        {
            $set: {
                status: 'closed',
                disposition,
                notes,
                reportDraft: disposition === 'suspicious' ? reportDraft : '',
                reviewedBy: actorId,
                reviewedAt: new Date(),
            },
        },
        { new: true }
    );
    if (!alert) {
        const exists = await AmlAlert.exists({ _id: alertId });
        throw exists
            ? new DomainError('ALREADY_CLOSED', 'This alert has already been closed', 409)
            : new DomainError('NOT_FOUND', 'Alert not found', 404);
    }

    audit(AUDIT.AML_ALERT_CLOSED, {
        userId: actorId, req,
        target: { type: 'AmlAlert', id: String(alert._id) },
        metadata: { subjectUserId: String(alert.userId), rule: alert.rule, disposition, draftedReport: Boolean(alert.reportDraft) },
    });

    if (alert.rule === 'WATCHLIST_MATCH') {
        const openMatches = await AmlAlert.countDocuments({ userId: alert.userId, rule: 'WATCHLIST_MATCH', status: 'open' });
        await KycSubmission.updateOne({ userId: alert.userId }, { $set: { 'screening.possibleMatches': openMatches } });
    }
    return alert;
};

export default {
    evaluateAml, gatherAmlSignals, monitorUser, monitorAfterMovement, sweepRecentActivity,
    checkSharedPan, checkSharedBankAccount, nameKey, candidateKeys, screenName, screenSubmission,
    importWatchlist, listWatchlists, listAlerts, getAlert, listUserAlerts, closeAlert, parseCsv,
};
