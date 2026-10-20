import TransactionBlock from './blocks/TransactionBlock';
import TopUpBlock from './blocks/TopUpBlock';
import WithdrawalBlock from './blocks/WithdrawalBlock';
import HeldTransferBlock from './blocks/HeldTransferBlock';
import TicketBlock from './blocks/TicketBlock';
import OptionsBlock from './blocks/OptionsBlock';
import PickBlock from './blocks/PickBlock';
import ConfirmBlock from './blocks/ConfirmBlock';
import HandoffBlock from './blocks/HandoffBlock';
import LinkBlock from './blocks/LinkBlock';
import NoticeBlock from './blocks/NoticeBlock';

const isObject = (value) => value !== null && typeof value === 'object';
const isText = (value) => typeof value === 'string' && value.length > 0;
const hasFact = (block, ...keys) =>
    isObject(block.fact) && Number.isInteger(block.fact.amountMinor ?? 0) && keys.every((k) => isText(block.fact[k]));

/**
 * Server block type → component, plus the minimum shape that component needs
 * (plan.md §25.3). A block whose type is unknown or whose shape fails its
 * guard is dropped, never rendered half-empty: the server can add a block
 * type before this bundle knows it (forward compatibility), and a malformed
 * block must not take the whole message down with it.
 *
 * `agentBlocks.test.jsx` pins the keys to the server's `Block` union.
 */
export const BLOCKS = {
    transaction: { component: TransactionBlock, valid: (b) => hasFact(b, 'id', 'type', 'status') },
    topup: { component: TopUpBlock, valid: (b) => hasFact(b, 'orderId', 'status') },
    withdrawal: { component: WithdrawalBlock, valid: (b) => hasFact(b, 'id', 'status') },
    held_transfer: { component: HeldTransferBlock, valid: (b) => hasFact(b, 'id', 'status', 'action') },
    ticket: { component: TicketBlock, valid: (b) => hasFact(b, 'ticketNumber', 'status') },
    options: {
        component: OptionsBlock,
        valid: (b) => Array.isArray(b.options) && b.options.length > 0 && b.options.every((o) => isText(o?.id) && isText(o?.label)),
    },
    pick: {
        component: PickBlock,
        valid: (b) =>
            Array.isArray(b.options) && isText(b.noneOfTheseId) && b.options.every((o) => isText(o?.id) && isText(o?.label)),
    },
    confirm: {
        component: ConfirmBlock,
        valid: (b) => isText(b.proposalId) && isText(b.title) && Array.isArray(b.lines),
    },
    handoff: { component: HandoffBlock, valid: (b) => isText(b.subject) },
    link: { component: LinkBlock, valid: (b) => isText(b.label) && isText(b.route) },
    notice: { component: NoticeBlock, valid: (b) => isText(b.text) },
};

/** The blocks this bundle can render, each paired with its component. */
export const renderableBlocks = (blocks) =>
    (Array.isArray(blocks) ? blocks : []).flatMap((block, index) => {
        const entry = isObject(block) ? BLOCKS[block.type] : undefined;
        return entry && entry.valid(block) ? [{ key: `${block.type}-${index}`, block, Component: entry.component }] : [];
    });

/** Blocks that show the user's own records — the reply was checked against them. */
export const RECORD_BLOCKS = new Set(['transaction', 'topup', 'withdrawal', 'held_transfer', 'ticket']);

export default BLOCKS;
