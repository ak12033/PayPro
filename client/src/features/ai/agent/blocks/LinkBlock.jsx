import React from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import { allowedRoute } from '../agentRoutes';

/** A way to a screen. Rendered only when the route passes the client's own allowlist too. */
const LinkBlock = ({ block, onNavigate }) => {
    const route = allowedRoute(block.route);
    if (!route) return null;

    return (
        <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            iconEnd={<ArrowRight size={14} aria-hidden="true" />}
            onClick={() => onNavigate(route)}
        >
            {block.label}
        </Button>
    );
};

export default LinkBlock;
