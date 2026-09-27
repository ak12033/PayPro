import React, { useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, Trash2, Upload } from 'lucide-react';
import Button, { IconButton } from '../../components/ui/Button';
import Field, { Select } from '../../components/ui/Field';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES } from '../../constants/kyc';
import { getErrorMessage } from '../../utils/errors';

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Pick a document type and a file, upload it, and list what is already there.
 *
 * Shared by identity verification and bank-account proof. The size and type
 * checks here are a courtesy so a 20 MB photo fails before it uploads; the
 * server re-checks both, and decides the type from the file's bytes rather than
 * its name.
 *
 * `onUpload({ type, file })` and `onRemove(document)` do the requests; this
 * component only reports failures and clears itself on success.
 */
const DocumentUploader = ({ documents = [], typeLabels, onUpload, onRemove, editable = true, maxDocuments }) => {
    const types = Object.entries(typeLabels);
    const [type, setType] = useState(types[0]?.[0] ?? '');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);
    const fileInputId = useId();

    const full = maxDocuments != null && documents.length >= maxDocuments;

    const choose = (event) => {
        const picked = event.target.files?.[0] ?? null;
        if (picked && picked.size > MAX_FILE_BYTES) {
            toast.error('That file is over 5 MB. Try a smaller photo or a PDF.');
            event.target.value = '';
            return;
        }
        setFile(picked);
    };

    const upload = async () => {
        if (!file) return;
        setBusy(true);
        try {
            await onUpload({ type, file });
            setFile(null);
            if (inputRef.current) inputRef.current.value = '';
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not upload that file.'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (document) => {
        setBusy(true);
        try {
            await onRemove(document);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not remove that file.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            {documents.length > 0 ? (
                <ul className="divide-y divide-border rounded-control border border-border">
                    {documents.map((document) => (
                        <li key={document._id} className="flex items-center gap-3 px-3 py-2.5">
                            <FileText size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-text">{typeLabels[document.type] ?? document.type}</span>
                                <span className="block truncate text-xs text-text-muted">
                                    {document.fileName || 'Unnamed file'} · {formatSize(document.size)}
                                </span>
                            </span>
                            {editable && onRemove && (
                                <IconButton label={`Remove ${typeLabels[document.type] ?? 'document'}`} size="sm" onClick={() => remove(document)} disabled={busy}>
                                    <Trash2 size={15} />
                                </IconButton>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-text-muted">No documents uploaded yet.</p>
            )}

            {editable && !full && (
                <div className="space-y-3 rounded-control bg-surface-sunken p-3">
                    <Field label="Document">
                        {(props) => (
                            <Select {...props} value={type} onChange={(e) => setType(e.target.value)}>
                                {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </Select>
                        )}
                    </Field>
                    <div className="space-y-1.5">
                        <label htmlFor={fileInputId} className="block text-sm font-medium text-text">File</label>
                        <input
                            id={fileInputId}
                            ref={inputRef}
                            type="file"
                            accept={ACCEPTED_FILE_TYPES}
                            onChange={choose}
                            aria-describedby={`${fileInputId}-hint`}
                            className="block w-full text-sm text-text-muted file:mr-3 file:rounded-control file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-text"
                        />
                        <p id={`${fileInputId}-hint`} className="text-xs text-text-muted">PDF, JPEG or PNG, up to 5 MB.</p>
                    </div>
                    <Button variant="secondary" icon={<Upload size={15} />} onClick={upload} loading={busy} disabled={!file}>
                        Upload
                    </Button>
                </div>
            )}
            {editable && full && (
                <p className="text-xs text-text-muted">You have uploaded the maximum number of documents. Remove one to add another.</p>
            )}
        </div>
    );
};

export default DocumentUploader;
