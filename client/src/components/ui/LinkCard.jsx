import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import cn from '../../lib/cn';
import Card from './Card';
import IconBadge from './IconBadge';

/**
 * A card whose whole surface goes to another screen: icon, title, one line of
 * context, and an arrow.
 *
 * Home and Insights had seven hand-written copies of this, each repeating its
 * own transition list, and those lists named `transform` while the lift is
 * applied through `translate`, so every one of them snapped instead of
 * rising. One component keeps the hover treatment in one place:
 *
 *   - the card grows slightly and takes the accent border and a shadow
 *     (Card's `interactive`);
 *   - the title and arrow take the accent.
 *
 * Keyboard focus gets the same growth, border and shadow as hover, so
 * tabbing through the grid shows where you are without relying on the
 * outline alone.
 */
const LinkCard = ({ to, icon, tone = 'accent', title, children, className }) => (
    <Link to={to} className={cn('group/link block rounded-card', className)}>
        <Card
            interactive
            className="h-full motion-safe:group-focus-visible/link:scale-[1.02] group-focus-visible/link:border-accent-border group-focus-visible/link:shadow-lift-card"
        >
            <div className="flex items-start gap-3">
                <IconBadge icon={icon} tone={tone} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text transition-colors duration-(--duration-hover) group-hover:text-accent-text">
                        {title}
                    </p>
                    {children && <p className="mt-0.5 text-xs leading-5 text-text-muted">{children}</p>}
                </div>
                <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-text-muted transition-colors duration-(--duration-hover) ease-(--ease-out) group-hover:text-accent-text"
                />
            </div>
        </Card>
    </Link>
);

export default LinkCard;
