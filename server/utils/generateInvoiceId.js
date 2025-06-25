export const generateInvoiceId = () => {
    const randomNum = Math.floor(10000000 + Math.random() * 90000000);
    const timestamp = Date.now().toString().slice(-4);
    return `AP${randomNum}${timestamp}`;
};