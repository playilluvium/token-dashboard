const { connectToDatabase } = require('../src/db');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Rate limiting middleware
const rateLimit = {
    windowMs: 60 * 1000, // 1 minute
    max: 30 // limit each IP to 30 requests per minute
};

async function fetchTokenData(address, chainId) {
    try {
        console.log('Searching for token:', `https://api.dexscreener.com/latest/dex/search?q=${address}`);
        const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${address}`);
        
        if (response.status === 429) {
            throw new Error('DexScreener rate limit reached. Please try again later.');
        }
        
        if (!response.ok) {
            throw new Error(`DexScreener API error: ${response.status}`);
        }

        const data = await response.json();
        const pairs = data.pairs?.filter(p => 
            p.chainId === chainId && 
            (p.baseToken.address.toLowerCase() === address.toLowerCase() || 
             p.quoteToken.address.toLowerCase() === address.toLowerCase())
        ).sort((a, b) => parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0));

        if (!pairs || pairs.length === 0) {
            throw new Error('No pairs found for token');
        }

        const pair = pairs[0];
        console.log('Using pair:', pair);

        // Return current token data
        return {
            price: parseFloat(pair.priceUsd),
            market_cap: parseFloat(pair.fdv || 0),
            liquidity: parseFloat(pair.liquidity?.usd || 0),
            volume_24h: parseFloat(pair.volume?.h24 || 0),
            price_change_24h: parseFloat(pair.priceChange?.h24 || 0),
            vol_mc_ratio: parseFloat(pair.volume?.h24 || 0) / parseFloat(pair.fdv || 1),
            liq_mc_ratio: parseFloat(pair.liquidity?.usd || 0) / parseFloat(pair.fdv || 1),
            vol_liq_ratio: parseFloat(pair.volume?.h24 || 0) / parseFloat(pair.liquidity?.usd || 1)
        };
    } catch (error) {
        console.error('Error fetching token data:', error);
        throw error;
    }
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const db = await connectToDatabase();
        const collection = db.collection('tokens');

        switch (req.method) {
            case 'GET':
                const view = req.query.view || 'list';
                let query = {};
                let projection = {};

                if (view === 'daily') {
                    projection = {
                        symbol: 1,
                        address: 1,
                        chainId: 1,
                        price: 1,
                        price_change_24h: 1,
                        market_cap: 1,
                        liquidity: 1,
                        volume_24h: 1,
                        timestamp: 1,
                        vol_mc_ratio: 1,
                        liq_mc_ratio: 1,
                        vol_liq_ratio: 1
                    };
                } else {
                    projection = { symbol: 1, address: 1, chainId: 1 };
                }

                const tokens = await collection
                    .find(query, { projection })
                    .sort(view === 'daily' ? { timestamp: -1 } : { symbol: 1 })
                    .toArray();

                res.json(tokens);
                break;

            case 'POST':
                const { symbol, address, chainId } = req.body;
                console.log('Adding new token:', { symbol, address, chainId });

                // Check if token exists
                const existingToken = await collection.findOne({ 
                    address: address.toLowerCase(), 
                    chainId 
                });

                if (existingToken) {
                    return res.status(400).json({ 
                        error: `Token with address ${address} already exists on ${chainId} chain` 
                    });
                }

                // Fetch token data
                const tokenData = await fetchTokenData(address, chainId);

                // Insert new token
                const result = await collection.insertOne({
                    symbol,
                    address: address.toLowerCase(),
                    chainId,
                    price: tokenData.price,
                    price_change_24h: tokenData.price_change_24h,
                    market_cap: tokenData.market_cap,
                    liquidity: tokenData.liquidity,
                    volume_24h: tokenData.volume_24h,
                    vol_mc_ratio: tokenData.vol_mc_ratio,
                    liq_mc_ratio: tokenData.liq_mc_ratio,
                    vol_liq_ratio: tokenData.vol_liq_ratio,
                    timestamp: new Date()
                });

                res.json({ id: result.insertedId });
                break;

            default:
                res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Error in tokens handler:', error);
        res.status(500).json({ error: error.message });
    }
} 