import React, { useEffect, useState } from 'react';
import { FileText, Eye } from 'lucide-react';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { getErrorMessage } from '../../utils/errors';

/**
 * Identity and bank-proof documents for a reviewer (plan.md §0.20.2).
 *
 * The server has no URL for a document — it streams the decrypted bytes to an
 * authorised, audited request. This fetches them as a Blob, shows them inline,
 * and revokes the object URL as soon as the viewer closes, so nothing outlives
 * the look. Each "View" is one audited read; the list itself reads nothing.
 *
 * `load(documentId)` returns the axios response with a Blob body.
 */
const DocumentViewer = ({ documents = [], typeLabels, load }) => {
    const [active, setActive] = useState(null);
    const [url, setUrl] = useState(null);
    const [contentType, setContentType] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!active) return undefined;
        let objectUrl = null;
        let cancelled = false;
        setUrl(null);
        setError(null);
        load(active._id)
            .then(({ data }) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(data);
                setContentType(data.type || active.contentType);
                setUrl(objectUrl);
            })
            .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not open this document.')));
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [active, load]);

    if (!documents.length) return <p className="text-sm text-text-muted">No documents uploaded.</p>;

    return (
        <div className="space-y-3">
            <ul className="divide-y divide-border rounded-control border border-border">
                {documents.map((doc) => (
                    <li key={doc._id} className="flex items-center gap-3 px-3 py-2.5">
                        <FileText size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text">{typeLabels[doc.type] ?? doc.type}</span>
                            <span className="block truncate text-xs text-text-muted">{doc.fileName || 'Unnamed'} · {Math.round(doc.size / 1024)} KB</span>
                        </span>
                        <Button
                            variant={active?._id === doc._id ? 'secondary' : 'ghost'}
                            size="sm"
                            icon={<Eye size={14} />}
                            onClick={() => setActive(active?._id === doc._id ? null : doc)}
                        >
                            {active?._id === doc._id ? 'Close' : 'View'}
                        </Button>
                    </li>
                ))}
            </ul>

            {active && (
                <div className="overflow-hidden rounded-control border border-border bg-surface-sunken">
                    {error ? (
                        <p role="alert" className="p-4 text-sm text-danger">{error}</p>
                    ) : !url ? (
                        <div className="grid h-48 place-items-center"><Spinner /></div>
                    ) : contentType === 'application/pdf' ? (
                        <iframe src={url} title={typeLabels[active.type] ?? 'Document'} className="h-[28rem] w-full bg-surface" />
                    ) : (
                        <img src={url} alt={typeLabels[active.type] ?? 'Document'} className="max-h-[28rem] w-full object-contain" />
                    )}
                    <p className="border-t border-border px-3 py-2 text-xs text-text-muted">Opening a document is recorded in the audit log.</p>
                </div>
            )}
        </div>
    );
};

export default DocumentViewer;
