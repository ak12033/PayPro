import React from 'react';
import { RotateCcw } from 'lucide-react';
import Spinner from '../../../components/ui/Spinner';
import cn from '../../../lib/cn';
import ReplyFeedback from './ReplyFeedback';
import SuggestionChips from './SuggestionChips';
import { RECORD_BLOCKS, renderableBlocks } from './agentBlocks';

const AI_FOOTNOTE = 'AI-generated. Check anything important against your activity.';
const RECORDS_FOOTNOTE = 'Checked against your PayPro records';

/** The footnote a reply has earned: AI wording is labelled, record-backed replies say so. */
const footnoteFor = (reply) => {
    if (reply.meta?.aiComposed) return AI_FOOTNOTE;
    if ((reply.blocks ?? []).some((b) => RECORD_BLOCKS.has(b?.type))) return RECORDS_FOOTNOTE;
    return null;
};

const UserBubble = ({ message, onRetry }) => (
    <li className="flex flex-col items-end">
        <div
            className={cn(
                'max-w-[85%] rounded-card px-3 py-2 text-sm leading-6',
                message.status === 'failed' ? 'bg-warning-soft text-text-secondary' : 'bg-accent text-on-accent'
            )}
        >
            {message.text}
        </div>
        {message.status === 'failed' && (
            <div className="mt-1 flex items-center gap-2 text-xs text-text-muted" role="alert">
                <span>{message.error}</span>
                <button
                    type="button"
                    onClick={() => onRetry(message.key)}
                    className="inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 font-medium text-text-secondary hover:bg-surface-hover hover:text-text"
                >
                    <RotateCcw size={12} aria-hidden="true" />
                    Retry
                </button>
            </div>
        )}
    </li>
);

const AgentBubble = ({ message, live, conversation, onNavigate, feedback }) => {
    const { reply } = message;
    const busy = conversation.sending || Boolean(conversation.executing);
    const footnote = footnoteFor(reply);
    const confirmLabel = reply.handoff ? 'Create ticket' : 'Confirm';

    return (
        <li className="flex justify-start">
            <div className="w-full max-w-[90%]">
                <div className="rounded-card bg-ai-soft/60 px-3 py-2 text-sm leading-6 text-text">
                    <span className="sr-only">Assistant said: </span>
                    <span className="whitespace-pre-line">{reply.message}</span>
                </div>

                {renderableBlocks(reply.blocks).map(({ key, block, Component }) => (
                    <Component
                        key={key}
                        block={block}
                        interactive={live && !conversation.closedProposals.has(block.proposalId)}
                        executing={conversation.executing === block.proposalId}
                        busy={busy}
                        autoFocus={live}
                        confirmLabel={confirmLabel}
                        onAct={conversation.act}
                        onConfirm={conversation.confirm}
                        onCancel={conversation.cancel}
                        onNavigate={onNavigate}
                    />
                ))}

                {reply.meta?.degraded && (
                    <p className="mt-1.5 text-2xs text-text-muted">Some checks are temporarily unavailable.</p>
                )}

                {live && <SuggestionChips suggestions={reply.suggestions} disabled={busy} onAct={conversation.act} />}

                {footnote && <p className="mt-1.5 text-2xs text-text-muted">{footnote}</p>}

                {/* Not on confirmation cards (§31.4): those are answered with their buttons. */}
                {feedback && reply.messageId && !reply.proposal && <ReplyFeedback messageId={reply.messageId} />}
            </div>
        </li>
    );
};

/**
 * The v2 transcript (plan.md §43.2). Only the latest agent message is live:
 * its chips, options, pick rows and confirm card can be used; everything
 * above it is a record.
 */
const AgentMessageList = ({ conversation, onNavigate, feedback = false }) => {
    const { messages, sending } = conversation;
    const lastAgent = messages.findLastIndex((m) => m.role === 'agent');

    return (
        <ul className="flex-1 space-y-3" aria-live="polite">
            {messages.map((message, index) => {
                if (message.role === 'user') {
                    return <UserBubble key={message.key} message={message} onRetry={conversation.retry} />;
                }
                if (message.role === 'error') {
                    return (
                        <li key={message.key} className="flex justify-start">
                            <div role="alert" className="max-w-[85%] rounded-card bg-warning-soft px-3 py-2 text-sm leading-6 text-text-secondary">
                                {message.text}
                            </div>
                        </li>
                    );
                }
                return (
                    <AgentBubble
                        key={message.key}
                        message={message}
                        live={index === lastAgent}
                        conversation={conversation}
                        onNavigate={onNavigate}
                        feedback={feedback}
                    />
                );
            })}

            {sending && (
                <li className="flex justify-start">
                    <div className="rounded-card bg-ai-soft/60 px-3 py-2.5">
                        <Spinner size="sm" tone="muted" />
                        <span className="sr-only">Assistant is typing</span>
                    </div>
                </li>
            )}
        </ul>
    );
};

export default AgentMessageList;
