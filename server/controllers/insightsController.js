import { asyncHandler } from '../utils/asyncHandler.js';
import { asObjectId, asEnum } from '../utils/sanitize.js';
import { listInsights, dismissInsight } from '../services/insightsService.js';

export const getInsights = asyncHandler(async (req, res) => {
    const status = asEnum(req.query.status, ['active', 'all'], 'active');
    const insights = await listInsights(req.user.id, { status });
    res.status(200).json({ insights });
});

export const patchDismissInsight = asyncHandler(async (req, res) => {
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'A valid insight id is required' });

    const insight = await dismissInsight(req.user.id, id);
    if (!insight) return res.status(404).json({ message: 'Insight not found' });

    res.status(200).json({ insight });
});
