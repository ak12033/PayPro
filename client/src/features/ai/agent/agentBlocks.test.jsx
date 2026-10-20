import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { fireEvent, render, screen } from '@testing-library/react';
import { BLOCKS, renderableBlocks } from './agentBlocks';
import { allowedRoute } from './agentRoutes';
import { TOPUP_STATUS_META } from './agentLabels';

// vitest runs from client/; the server lives beside it in the monorepo.
const SERVER = resolve(cwd(), '../fastapi-server/services/agent');

const at = '2026-10-20T10:00:00Z';

/** One valid example of every block the server can send. */
const EXAMPLES = {
    transaction: {
        type: 'transaction',
        fact: { id: 'tx1', invoiceId: 'INV-1', status: 'FAILED', type: 'Debit', amountMinor: 50000, createdAt: at, counterpartyName: 'Asha Rao', failureReason: 'Insufficient balance' },
    },
    topup: {
        type: 'topup',
        fact: { orderId: 'order_ABCDEFGH12', paymentIdMasked: 'pay_…1234', status: 'captured', amountMinor: 120000, createdAt: at, walletCredited: false, ageMinutes: 5 },
        doNotPayAgain: true,
    },
    withdrawal: {
        type: 'withdrawal',
        fact: { id: 'wd1', status: 'rejected', amountMinor: 200000, createdAt: at, userVisibleReason: 'Name mismatch on bank account', bankMasked: 'XXXX1234' },
    },
    held_transfer: {
        type: 'held_transfer',
        fact: { id: 'h1', action: 'hold', status: 'open', amountMinor: 7500000, counterpartyName: 'Ravi Kumar', autoReleaseAt: at },
    },
    ticket: {
        type: 'ticket',
        fact: { id: 't1', ticketNumber: 'PP-ABC123', category: 'payment', status: 'open' },
        link: '/account/support',
    },
    options: {
        type: 'options',
        options: [
            { id: 'op_1', label: 'A failed top-up', kind: 'ask' },
            { id: 'op_2', label: 'A held transfer', kind: 'ask' },
        ],
    },
    pick: {
        type: 'pick',
        options: [{ id: 'pk_1', label: 'Asha Rao', fact: { id: 'tx1', amountMinor: 50000, createdAt: at } }],
        noneOfTheseId: 'pk_2',
    },
    confirm: {
        type: 'confirm',
        proposalId: 'pr_1',
        title: 'Cancel withdrawal',
        lines: [{ label: 'Amount', value: '₹2,000', amountMinor: 200000 }],
        irreversible: true,
        expiresAt: at,
        nonce: 'n1',
    },
    handoff: { type: 'handoff', category: 'payment', subject: 'Top-up not credited', summaryPreview: 'Issue: top-up' },
    link: { type: 'link', label: 'Add money', route: '/money/add?amount=500' },
    notice: { type: 'notice', text: 'Sign out other devices', route: '/account/security' },
};

const props = (overrides = {}) => ({
    interactive: true,
    busy: false,
    executing: false,
    onAct: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
});

const renderBlock = (block, overrides) => {
    const [{ Component }] = renderableBlocks([block]);
    const p = props(overrides);
    render(<Component block={block} {...p} />);
    return p;
};

describe('agentBlocks — pinned to the server (plan.md §34.6)', () => {
    it('maps exactly the server Block union', () => {
        const models = readFileSync(resolve(SERVER, 'models.py'), 'utf-8');
        const serverTypes = [...models.matchAll(/type: Literal\["(\w+)"\] = "\1"/g)].map((m) => m[1]);
        expect(new Set(serverTypes)).toEqual(new Set(Object.keys(BLOCKS)));
        expect(new Set(Object.keys(EXAMPLES))).toEqual(new Set(Object.keys(BLOCKS)));
    });

    it('top-up labels match the server prose', () => {
        const formatting = readFileSync(resolve(SERVER, 'responses/formatting.py'), 'utf-8');
        const body = formatting.match(/TOPUP_STATUS_LABEL = \{(.*?)\}/s)[1];
        const server = Object.fromEntries([...body.matchAll(/"(\w+)": "([^"]+)"/g)].map((m) => [m[1], m[2]]));
        const client = Object.fromEntries(Object.entries(TOPUP_STATUS_META).map(([k, v]) => [k, v.label]));
        expect(client).toEqual(server);
    });
});

describe('renderableBlocks', () => {
    it('keeps every known, well-formed block', () => {
        expect(renderableBlocks(Object.values(EXAMPLES))).toHaveLength(Object.keys(EXAMPLES).length);
    });

    it('drops unknown types and malformed blocks instead of failing', () => {
        const kept = renderableBlocks([
            { type: 'chart', data: [1, 2] },
            { type: 'transaction' },
            { type: 'confirm', title: 'No proposal id', lines: [] },
            null,
            'text',
            EXAMPLES.notice,
        ]);
        expect(kept.map((k) => k.block.type)).toEqual(['notice']);
    });

    it('tolerates a missing list', () => {
        expect(renderableBlocks(undefined)).toEqual([]);
    });
});

describe('each block renders', () => {
    it('transaction: name, status, money via Amount, and opens the detail sheet', () => {
        renderBlock(EXAMPLES.transaction);
        expect(screen.getByText('Asha Rao')).toBeInTheDocument();
        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByText('500 rupees sent')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Open transaction/ }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('topup: status, reference and the do-not-pay-again line', () => {
        renderBlock(EXAMPLES.topup);
        expect(screen.getByText('Paid')).toBeInTheDocument();
        expect(screen.getByText(/pay_…1234/)).toBeInTheDocument();
        expect(screen.getByText(/do not pay again/)).toBeInTheDocument();
        expect(screen.getByText('1,200 rupees')).toBeInTheDocument();
    });

    it('withdrawal: client status label and the user-visible reason', () => {
        renderBlock(EXAMPLES.withdrawal);
        expect(screen.getByText('Not approved')).toBeInTheDocument();
        expect(screen.getByText('Name mismatch on bank account')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Withdrawal' })).toBeInTheDocument();
    });

    it('held transfer: first name only, release time, no rule codes', () => {
        renderBlock(EXAMPLES.held_transfer);
        expect(screen.getByText('Transfer to Ravi')).toBeInTheDocument();
        expect(screen.queryByText(/Kumar/)).not.toBeInTheDocument();
        expect(screen.getByText('On hold')).toBeInTheDocument();
        expect(screen.getByText(/Released by/)).toBeInTheDocument();
    });

    it('ticket: number, status and an allowlisted link', () => {
        const p = renderBlock(EXAMPLES.ticket);
        expect(screen.getByText('PP-ABC123')).toBeInTheDocument();
        expect(screen.getByText('Open')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open ticket' }));
        expect(p.onNavigate).toHaveBeenCalledWith('/account/support');
    });

    it('options: each sends its id with its label', () => {
        const p = renderBlock(EXAMPLES.options);
        fireEvent.click(screen.getByRole('button', { name: 'A held transfer' }));
        expect(p.onAct).toHaveBeenCalledWith({ type: 'option', id: 'op_2' }, 'A held transfer');
    });

    it('options are inert when not the latest message', () => {
        renderBlock(EXAMPLES.options, { interactive: false });
        expect(screen.getByRole('button', { name: 'A failed top-up' })).toBeDisabled();
    });

    it('pick: rows and "None of these" send their ids', () => {
        const p = renderBlock(EXAMPLES.pick);
        fireEvent.click(screen.getByRole('button', { name: /Asha Rao/ }));
        fireEvent.click(screen.getByRole('button', { name: 'None of these' }));
        expect(p.onAct.mock.calls).toEqual([
            [{ type: 'pick', id: 'pk_1' }, 'Asha Rao'],
            [{ type: 'pick', id: 'pk_2' }, 'None of these'],
        ]);
    });

    it('handoff: subject, category and a collapsible preview', () => {
        renderBlock(EXAMPLES.handoff);
        expect(screen.getByText('Top-up not credited')).toBeInTheDocument();
        expect(screen.getByText('Payment')).toBeInTheDocument();
        expect(screen.getByText('What support will see')).toBeInTheDocument();
    });

    it('link: navigates to an allowlisted route, query kept', () => {
        const p = renderBlock(EXAMPLES.link);
        fireEvent.click(screen.getByRole('button', { name: 'Add money' }));
        expect(p.onNavigate).toHaveBeenCalledWith('/money/add?amount=500');
    });

    it('link: renders nothing for a route outside the allowlist', () => {
        const { container } = render(
            <BLOCKS.link.component block={{ type: 'link', label: 'Admin', route: '/admin/users' }} {...props()} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('notice: text and its link', () => {
        const p = renderBlock(EXAMPLES.notice);
        expect(screen.getByRole('note')).toHaveTextContent('Sign out other devices');
        fireEvent.click(screen.getByRole('button', { name: 'Go there' }));
        expect(p.onNavigate).toHaveBeenCalledWith('/account/security');
    });
});

describe('allowedRoute — the client-side second check (plan.md §43.2)', () => {
    it.each([
        ['/account/support', '/account/support'],
        ['/money/add?amount=500', '/money/add?amount=500'],
        ['/money/add?amount=<script>', '/money/add'],
        ['/activity#top', '/activity'],
    ])('%s → %s', (input, expected) => {
        expect(allowedRoute(input)).toBe(expected);
    });

    it.each([
        'https://evil.example/home',
        '//evil.example',
        '/admin',
        '/admin/users',
        '/login',
        '/',
        '/verify-otp',
        '/nowhere',
        'javascript:alert(1)',
        '',
        null,
    ])('refuses %s', (input) => {
        expect(allowedRoute(input)).toBeNull();
    });
});
