import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Card from './ui/Card';
import Button from './ui/Button';
import EmptyState from './feedback/EmptyState';
import FullScreenLoader from './feedback/FullScreenLoader';
import { can, isStaff } from '../constants/admin';
import { ROUTES } from '../constants/routes';

/**
 * Role gate for the operations console (plan.md §28.4).
 *
 * A convenience, not a control. The role here comes from the profile the
 * client already loaded, and anyone can edit their own JS — the actual
 * authorisation is `requireRole` on every `/api/admin/*` request, re-read
 * from the database each time (context.md §5.9). What this prevents is a
 * customer who types `/admin` landing on a screen full of 403 errors.
 *
 * Two different refusals, on purpose:
 *   - not staff at all → silently back to Home; there is nothing here for them
 *     and nothing worth explaining;
 *   - staff without this section's capability → an explicit "not available to
 *     your role", because a support agent following a link from a colleague
 *     should learn why the page is empty rather than think it is broken.
 */
const RequireRole = ({ capability, children }) => {
    const { user, isCheckingAuth } = useAuth();

    if (isCheckingAuth || !user) {
        return <FullScreenLoader srLabel="Checking access" />;
    }

    const role = user.role ?? 'user';

    if (!isStaff(role)) {
        return <Navigate to={ROUTES.HOME} replace />;
    }

    if (capability && !can(role, capability)) {
        return (
            <Card>
                <EmptyState
                    variant="filtered"
                    icon={<ShieldOff size={20} />}
                    title="Not available to your role"
                    description="This section of the console needs a different role. Ask an admin if you think you should have access."
                    action={
                        <Button variant="secondary" onClick={() => window.history.back()}>
                            Go back
                        </Button>
                    }
                />
            </Card>
        );
    }

    return children ?? <Outlet />;
};

export default RequireRole;
