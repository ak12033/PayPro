import PDFDocument from 'pdfkit';
import Transaction from '../models/Transaction.js';
import { monthBoundsIST } from '../utils/period.js';
import { amountMinorOf, fromPaise } from '../utils/money.js';
import logger from '../utils/logger.js';
import { csvCell } from '../controllers/transactionController.js';

/** Shared month-bounded, ownership-scoped query for both statement formats (plan.md §11.4). */
const monthQuery = (userId, month) => {
    const { start, end } = monthBoundsIST(month);
    return { filter: { userId, postedAt: { $gte: start, $lt: end } }, start, end };
};

/** Streams a CSV statement — the same cursor + injection-safe escaping as `exportTransactionsCsv`, scoped to one calendar month. */
export const streamCsv = async (res, userId, { month } = {}) => {
    const { filter, start } = monthQuery(userId, month);
    const stamp = start.toISOString().slice(0, 7);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="paypro-statement-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');

    res.write('﻿');
    res.write('Date,Invoice ID,Description,Category,Type,Amount (INR),Status\n');

    const cursor = Transaction.find(filter)
        .sort({ postedAt: 1 })
        .select('postedAt invoiceId description category type amount amountMinor status')
        .lean()
        .cursor();

    try {
        for await (const t of cursor) {
            res.write([
                csvCell(new Date(t.postedAt).toISOString()),
                csvCell(t.invoiceId),
                csvCell(t.description),
                csvCell(t.category),
                csvCell(t.type),
                csvCell(fromPaise(amountMinorOf(t)).toFixed(2)),
                csvCell(t.status),
            ].join(',') + '\n');
        }
        res.end();
    } catch (err) {
        logger.error('Statement CSV export failed mid-stream', { err });
        res.destroy(err);
    }
};

/** Streams a PDF statement: header, a transaction table, a category summary footer. */
export const streamPdf = async (res, user, { month } = {}) => {
    const { filter, start, end } = monthQuery(user._id, month);
    const stamp = start.toISOString().slice(0, 7);

    const transactions = await Transaction.find(filter)
        .sort({ postedAt: 1 })
        .select('postedAt description category type amount amountMinor status')
        .lean();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="paypro-statement-${stamp}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(18).text('PayPro Statement', { align: 'left' });
    doc.fontSize(10).fillColor('#465561')
        .text(`${user.firstName} ${user.lastName || ''}`.trim())
        .text(user.email)
        .text(`Period: ${stamp} (${start.toDateString()} – ${new Date(end.getTime() - 1).toDateString()})`);
    doc.moveDown(1);

    // Summed in paise so the statement's totals are exact.
    let credit = 0;
    let debit = 0;
    const byCategory = new Map();
    for (const t of transactions) {
        const minor = amountMinorOf(t);
        if (t.type === 'Credit') credit += minor; else debit += minor;
        byCategory.set(t.category, (byCategory.get(t.category) || 0) + (t.type === 'Debit' ? minor : 0));
    }
    const inr = (minor) => fromPaise(minor).toFixed(2);

    doc.fillColor('#0d1117').fontSize(12).text('Summary', { underline: true });
    doc.fontSize(10).fillColor('#465561')
        .text(`Money in: ₹${inr(credit)}`)
        .text(`Money out: ₹${inr(debit)}`)
        .text(`Net: ₹${inr(credit - debit)}`);
    doc.moveDown(1);

    doc.fillColor('#0d1117').fontSize(12).text('Transactions', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#465561');

    for (const t of transactions) {
        const line = `${new Date(t.postedAt).toISOString().slice(0, 10)}  ${t.type.padEnd(6)}  ${t.category.padEnd(16)}  ₹${inr(amountMinorOf(t)).padStart(12)}  ${t.description.slice(0, 50)}`;
        if (doc.y > 760) doc.addPage();
        doc.text(line);
    }

    if (transactions.length === 0) {
        doc.text('No transactions this period.');
    }

    doc.moveDown(1);
    doc.fontSize(12).fillColor('#0d1117').text('By category', { underline: true });
    doc.fontSize(9).fillColor('#465561');
    for (const [category, amount] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
        if (amount <= 0) continue;
        doc.text(`${category.padEnd(20)} ₹${amount.toFixed(2)}`);
    }

    doc.end();
};
