/**
 * Password strength scoring.
 *
 * Signup and Update-profile each carried their own near-identical copy of this
 * function with slightly different labels, so the two screens disagreed about
 * what counted as "strong".
 *
 * The bands now name the *missing requirement* rather than only the verdict.
 * "Fair password" tells a user they have failed without telling them how to
 * pass, which is the most common failure mode of a strength meter.
 */

const REQUIREMENTS = [
    { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
    { id: 'upper', label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
    { id: 'number', label: 'A number', test: (v) => /[0-9]/.test(v) },
    { id: 'symbol', label: 'A symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const BANDS = [
    { label: 'Weak', tone: 'bg-danger' },
    { label: 'Fair', tone: 'bg-warning' },
    { label: 'Good', tone: 'bg-info' },
    { label: 'Strong', tone: 'bg-positive' },
];

export const getPasswordStrength = (value = '') => {
    const met = REQUIREMENTS.filter((requirement) => requirement.test(value));
    const unmet = REQUIREMENTS.filter((requirement) => !requirement.test(value));
    const score = met.length;

    if (!value) {
        return { score: 0, label: '', tone: 'bg-border', requirements: REQUIREMENTS, unmet };
    }

    return {
        score,
        ...BANDS[Math.max(0, score - 1)],
        requirements: REQUIREMENTS,
        unmet,
    };
};

export default getPasswordStrength;
