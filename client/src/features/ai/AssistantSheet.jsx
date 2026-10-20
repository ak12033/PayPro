import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sheet from '../../components/ui/Sheet';
import Spinner from '../../components/ui/Spinner';
import LegacyChat from './LegacyChat';
import AgentChat from './agent/AgentChat';
import useAgentConfig from './agent/useAgentConfig';

/**
 * The assistant, in whichever form the server says this account gets
 * (plan.md §25, §38).
 *
 * `GET /ai/agent/config` is asked on every opening — never on mount — and
 * decides: `legacy` renders `LegacyChat`, the plain-text chat exactly as it
 * was; `v2` renders `AgentChat`, the case-driven agent with cards and
 * confirmations. Any doubt (a failed config call, an older server, a 403
 * `AGENT_DISABLED` mid-conversation) resolves to legacy, so an old bundle
 * against a new server and a new bundle against an old one both work.
 *
 * Opened through `AssistantContext`, which mounts one of these lazily for
 * the whole shell; pages pass a `prompt` and/or a `resource` to open it
 * about something specific.
 */
const AssistantSheet = ({ open, onClose, initialPrompt, initialResource }) => {
    const location = useLocation();
    const { loading, config } = useAgentConfig(open, location.pathname);
    const [disabled, setDisabled] = useState(false);

    useEffect(() => {
        if (open) setDisabled(false);
    }, [open]);

    if (!open) return null;

    if (loading || !config) {
        return (
            <Sheet open onClose={onClose} title="Assistant" size="lg" className="sm:h-[36rem]">
                <div className="grid min-h-full place-items-center py-10">
                    <Spinner tone="muted" />
                    <span className="sr-only">Opening the assistant</span>
                </div>
            </Sheet>
        );
    }

    if (config.mode === 'v2' && !disabled) {
        return (
            <AgentChat
                open
                onClose={onClose}
                config={config}
                initialPrompt={initialPrompt}
                initialResource={initialResource}
                onDisabled={() => setDisabled(true)}
            />
        );
    }

    return <LegacyChat open onClose={onClose} initialPrompt={initialPrompt} />;
};

export default AssistantSheet;
