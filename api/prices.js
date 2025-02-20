const { connectToDatabase } = require('../src/db');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export default async function handler(req, res) {
    const { address, chainId } = req.query;
    const range = req.query.range || '48h';

    try {
        const db = await connectToDatabase();
        const collection = db.collection('token_prices');

        // Build query based on range
        let timeFilter = new Date();
        switch(range) {
            case '48h':
                timeFilter.setDate(timeFilter.getDate() - 2);
                break;
            case '1M':
                timeFilter.setDate(timeFilter.getDate() - 30);
                break;
            case 'ALL':
                timeFilter.setFullYear(timeFilter.getFullYear() - 10);
                break;
            default:
                timeFilter.setDate(timeFilter.getDate() - 2);
        }

        const prices = await collection
            .find({
                token_address: address.toLowerCase(),
                chain_id: chainId,
                timestamp: { $gte: timeFilter }
            })
            .sort({ timestamp: 1 })
            .toArray();

        res.json(prices);
    } catch (error) {
        console.error('Error fetching historical prices:', error);
        res.status(500).json({ error: error.message });
    }
} 