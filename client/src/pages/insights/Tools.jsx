import React from 'react';
import PageHeader from '../../components/layout/PageHeader';
import EmiCalculator from '../../features/tools/EmiCalculator';

/**
 * Calculators (plan.md §22).
 *
 * A separate destination from Insights because nothing here reads the user's
 * data. Insights is "here is what your money did"; this is a scratchpad for a
 * decision that has not happened yet, and mixing the two would imply PayPro
 * knows something about a loan it has never seen.
 */
const Tools = () => (
    <>
        <PageHeader
            title="Calculators"
            subtitle="Work out the numbers on a decision. Nothing here reads your account or leaves your device."
            back={true}
        />

        <div className="space-y-4">
            <EmiCalculator />
        </div>
    </>
);

export default Tools;
