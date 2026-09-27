import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId } from '../utils/sanitize.js';
import { uploadedFile } from '../utils/fileUpload.js';
import { DomainError } from '../utils/domainError.js';
import {
    listBankAccounts, addBankAccount, addBankDocument, removeBankAccount,
    listMyWithdrawals, getEligibility, requestWithdrawal, cancelWithdrawal,
} from '../services/withdrawalService.js';

/**
 * The holder's withdrawals and bank accounts (plan.md §0.20.3). Owner-scoped
 * throughout — every service call carries `req.user.id`.
 */

const idParam = (value) => {
    const id = asObjectId(value);
    if (!id) throw new DomainError('INVALID_ID', 'A valid id is required', 400);
    return id;
};

export const getWithdrawals = asyncHandler(async (req, res) => {
    const [withdrawals, eligibility] = await Promise.all([listMyWithdrawals(req.user.id), getEligibility(req.user.id)]);
    res.status(200).json({ withdrawals, eligibility });
});

export const postWithdrawal = asyncHandler(async (req, res) => {
    res.status(201).json(await requestWithdrawal(req.user.id, req.body ?? {}, { req }));
});

export const postCancelWithdrawal = asyncHandler(async (req, res) => {
    res.status(200).json(await cancelWithdrawal(req.user.id, idParam(req.params.id), { req }));
});

export const getBankAccounts = asyncHandler(async (req, res) => {
    res.status(200).json({ accounts: await listBankAccounts(req.user.id) });
});

export const postBankAccount = asyncHandler(async (req, res) => {
    res.status(201).json({ account: await addBankAccount(req.user.id, req.body ?? {}, { req }) });
});

export const postBankDocument = asyncHandler(async (req, res) => {
    res.status(201).json({ document: await addBankDocument(req.user.id, idParam(req.params.id), uploadedFile(req), { req }) });
});

export const deleteBankAccount = asyncHandler(async (req, res) => {
    await removeBankAccount(req.user.id, idParam(req.params.id), { req });
    res.status(200).json({ message: 'Bank account removed' });
});
