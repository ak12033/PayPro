import getLocation from '../utils/getLocation.js';

const locationMiddleware = async (req, res, next) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '';
        const location = await getLocation(ip);
        req.currentLocation = location;
        next();
    } catch (error) {
        console.error('Location Middleware Error:', error);
        req.currentLocation = { city: 'Unknown', ip: 'Unknown', isp: 'Unknown ISP' };
        next();
    }
};

export default locationMiddleware;
