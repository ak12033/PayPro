import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId } from '../utils/sanitize.js';
import { DomainError } from '../utils/domainError.js';
import {
    listHoldings, createHolding, updateHolding, removeHolding,
    listLiabilities, createLiability, updateLiability, removeLiability, getSummary,
} from '../services/portfolioService.js';

/** Self-reported holdings and debts (plan.md §21, §22). Owner-scoped throughout. */

const idParam = (value) => {
    const id = asObjectId(value);
    if (!id) throw new DomainError('INVALID_ID', 'A valid id is required', 400);
    return id;
};

export const getPortfolioSummary = asyncHandler(async (req, res) => {
    res.status(200).json({ summary: await getSummary(req.user.id) });
});

export const getHoldings = asyncHandler(async (req, res) => {
    res.status(200).json({ holdings: await listHoldings(req.user.id) });
});

export const postHolding = asyncHandler(async (req, res) => {
    res.status(201).json({ holding: await createHolding(req.user.id, req.body ?? {}, { req }) });
});

export const patchHolding = asyncHandler(async (req, res) => {
    res.status(200).json({ holding: await updateHolding(req.user.id, idParam(req.params.id), req.body ?? {}, { req }) });
});

export const deleteHolding = asyncHandler(async (req, res) => {
    await removeHolding(req.user.id, idParam(req.params.id), { req });
    res.status(200).json({ message: 'Holding removed' });
});

export const getLiabilities = asyncHandler(async (req, res) => {
    res.status(200).json({ liabilities: await listLiabilities(req.user.id) });
});

export const postLiability = asyncHandler(async (req, res) => {
    res.status(201).json({ liability: await createLiability(req.user.id, req.body ?? {}, { req }) });
});

export const patchLiability = asyncHandler(async (req, res) => {
    res.status(200).json({ liability: await updateLiability(req.user.id, idParam(req.params.id), req.body ?? {}, { req }) });
});

export const deleteLiability = asyncHandler(async (req, res) => {
    await removeLiability(req.user.id, idParam(req.params.id), { req });
    res.status(200).json({ message: 'Debt removed' });
});
