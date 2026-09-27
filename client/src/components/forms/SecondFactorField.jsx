import React, { useState } from 'react';
import OtpField from './OtpField';
import { Field, Input } from '../ui/Field';

/**
 * Code entry for a second-factor challenge (plan.md §31.2.4).
 *
 * `method: 'email'` is exactly the old `OtpField`. `method: 'totp'` labels the
 * same field for the authenticator app and adds the way out the recovery
 * policy depends on: "Use a recovery code instead", which swaps in a plain
 * text field. Recovery codes are ten characters with an optional dash, so they
 * cannot share the six-box digit field.
 */

const SecondFactorField = ({ method = 'email', value, onChange, onSubmit, error, disabled }) => {
    const [useRecovery, setUseRecovery] = useState(false);

    const switchMode = () => {
        setUseRecovery((on) => !on);
        onChange('');
    };

    if (method !== 'totp') {
        return <OtpField value={value} onChange={onChange} onSubmit={onSubmit} error={error} disabled={disabled} />;
    }

    return (
        <div>
            {useRecovery ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit?.();
                    }}
                >
                    <Field label="Recovery code" hint="One of the codes you saved when you set up the app, like ABCDE-23456." error={error}>
                        {(props) => (
                            <Input
                                {...props}
                                value={value}
                                onChange={(event) => onChange(event.target.value.toUpperCase().slice(0, 11))}
                                autoComplete="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                autoFocus
                                disabled={disabled}
                                placeholder="XXXXX-XXXXX"
                                className="font-mono tracking-wider"
                            />
                        )}
                    </Field>
                </form>
            ) : (
                <OtpField
                    label="Code from your authenticator app"
                    value={value}
                    onChange={onChange}
                    onSubmit={onSubmit}
                    error={error}
                    disabled={disabled}
                />
            )}

            <button
                type="button"
                onClick={switchMode}
                className="mt-3 text-sm font-medium text-accent-text"
            >
                {useRecovery ? 'Use the authenticator app instead' : 'Lost your phone? Use a recovery code'}
            </button>
        </div>
    );
};

export default SecondFactorField;
