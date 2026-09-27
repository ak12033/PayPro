import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asEnum, asString } from '../utils/sanitize.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import {
    listGoals,
    createGoal,
    getGoal,
    updateGoal,
    archiveGoal,
    addContribution,
    removeContribution,
    getProjection,
    GoalError,
} from '../services/goalService.js';

const GOAL_TYPES = ['emergency', 'vacation', 'vehicle', 'education', 'home', 'custom'];
const GOAL_STATUSES = ['active', 'completed', 'archived'];

const handleGoalError = (res, err) => {
    if (err instanceof GoalError) {
        res.status(err.status).json({ message: err.message });
        return true;
    }
    return false;
};

export const getGoals = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, GOAL_STATUSES);
    const goals = await listGoals(req.user.id, { status });
    res.status(200).json({ goals });
});

export const postGoal = asyncHandler(async (req, res) => {
    const { name, targetMinor, targetDate } = req.body || {};
    if (!asString(name, { maxLength: 60 })) return res.status(400).json({ message: 'A goal name is required' });
    if (!(Number(targetMinor) > 0)) return res.status(400).json({ message: 'A positive target amount is required' });
    if (!targetDate || Number.isNaN(new Date(targetDate).getTime())) {
        return res.status(400).json({ message: 'A valid target date is required' });
    }

    const goal = await createGoal(req.user.id, {
        name,
        type: asEnum(req.body?.type, GOAL_TYPES) || 'custom',
        icon: asString(req.body?.icon, { maxLength: 40 }) || undefined,
        targetMinor: Number(targetMinor),
        targetDate: new Date(targetDate),
        autoContribute: req.body?.autoContribute,
    });

    audit(AUDIT.GOAL_CREATED, { userId: req.user.id, req, target: { type: 'Goal', id: String(goal._id) } });
    res.status(201).json({ goal });
});

export const getGoalById = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid goal id is required' });

    try {
        const result = await getGoal(req.user.id, id);
        res.status(200).json(result);
    } catch (err) {
        if (!handleGoalError(res, err)) throw err;
    }
});

export const patchGoal = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid goal id is required' });

    try {
        const goal = await updateGoal(req.user.id, id, req.body || {});
        audit(AUDIT.GOAL_UPDATED, { userId: req.user.id, req, target: { type: 'Goal', id } });
        res.status(200).json({ goal });
    } catch (err) {
        if (!handleGoalError(res, err)) throw err;
    }
});

export const deleteGoal = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid goal id is required' });

    try {
        await archiveGoal(req.user.id, id);
        audit(AUDIT.GOAL_ARCHIVED, { userId: req.user.id, req, target: { type: 'Goal', id } });
        res.status(200).json({ message: 'Goal archived' });
    } catch (err) {
        if (!handleGoalError(res, err)) throw err;
    }
});

export const postContribution = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid goal id is required' });

    const amountMinor = Number(req.body?.amountMinor);
    if (!(amountMinor > 0)) return res.status(400).json({ message: 'A positive amount is required' });

    const direction = asEnum(req.body?.direction, ['in', 'out'], 'in');
    const note = asString(req.body?.note, { maxLength: 280 }) || '';

    try {
        const { goal, contribution } = await addContribution(req.user.id, id, { amountMinor, direction, note });
        audit(AUDIT.GOAL_CONTRIBUTION_ADDED, {
            userId: req.user.id, req, target: { type: 'Goal', id },
            metadata: { amountMinor, direction },
        });
        if (goal.status === 'completed' && goal.completedAt) {
            audit(AUDIT.GOAL_COMPLETED, { userId: req.user.id, req, target: { type: 'Goal', id } });
        }
        res.status(201).json({ goal, contribution });
    } catch (err) {
        if (!handleGoalError(res, err)) throw err;
    }
});

export const deleteContribution = asyncHandler(async (req, res) => {
    const goalId = asObjectId(req.params.id);
    const contributionId = asObjectId(req.params.contributionId);
    if (!goalId || !contributionId) return res.status(400).json({ message: 'A valid id is required' });

    try {
        const goal = await removeContribution(req.user.id, goalId, contributionId);
        audit(AUDIT.GOAL_CONTRIBUTION_REMOVED, { userId: req.user.id, req, target: { type: 'Goal', id: goalId } });
        res.status(200).json({ goal });
    } catch (err) {
        if (!handleGoalError(res, err)) throw err;
    }
});

export const getGoalProjection = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid goal id is required' });

    try {
        const projection = await getProjection(req.user.id, id);
        res.status(200).json(projection);
    } catch (err) {
        if (!handleGoalError(res, err)) throw err;
    }
});
