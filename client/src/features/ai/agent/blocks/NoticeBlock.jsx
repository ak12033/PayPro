import React from 'react';
import { ShieldAlert } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import { allowedRoute } from '../agentRoutes';

/** Guidance that stands apart from the reply — usually security ("Sign out other devices"). */
const NoticeBlock = ({ block, onNavigate }) => {
    const route = allowedRoute(block.route);

    return (
        <div role="note" className="mt-2 flex items-start gap-2 rounded-card bg-warning-soft px-3 py-2.5 text-sm">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="leading-5 text-text">{block.text}</p>
                {route && (
                    <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={() => onNavigate(route)}>
                        Go there
                    </Button>
                )}
            </div>
        </div>
    );
};

export default NoticeBlock;
