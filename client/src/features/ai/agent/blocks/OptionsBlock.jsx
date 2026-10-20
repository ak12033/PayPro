import React from 'react';
import Button from '../../../../components/ui/Button';

/** 2–4 answers to "which did you mean?". Only the latest message's options can be tapped. */
const OptionsBlock = ({ block, interactive, busy = false, onAct }) => (
    <div role="group" aria-label="Choose one" className="mt-2 flex flex-col gap-2">
        {block.options.map((option) => (
            <Button
                key={option.id}
                variant="secondary"
                size="sm"
                className="justify-start text-left"
                disabled={!interactive || busy}
                onClick={() => onAct({ type: 'option', id: option.id }, option.label)}
            >
                {option.label}
            </Button>
        ))}
    </div>
);

export default OptionsBlock;
