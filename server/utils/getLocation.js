import axios from 'axios';

const getLocation = async (ip) => {
    try {
        if (!ip || ip === '::1' || ip === '127.0.0.1') {
            // Local development fallback
            return {
                city: 'New Delhi',
                ip: '127.0.0.1',
                isp: 'Local ISP',
            };
        }

        const res = await axios.get(`https://ipapi.co/${ip}/json/`);

        if(res.data) {
            return {
                city: res.data.city || 'Unknown',
                ip: ip,
                isp: res.data.org || 'Unknown ISP', // ISP / org name
            };
        } 
    } catch (error) {
        console.error('IP Location Lookup Failed:', error.message);
        return {
            city: 'Unknown',
            ip: ip,
            isp: 'Unknown ISP',
        };
    }
};

export default getLocation;
