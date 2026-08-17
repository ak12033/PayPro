/**
 * Triggers a browser download for an in-memory blob.
 *
 * Revoking the object URL matters: without it the blob is retained for the
 * lifetime of the tab, which is real memory for a large CSV export.
 */
export const downloadBlob = (data, filename, type = 'text/csv') => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
};
