const { connectToDatabase } = require('../src/db');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function fetchTokenData(address, chainId) {
    try {
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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = await connectToDatabase();
        const collection = db.collection('tokens');

        const tokens = await collection.find({}).toArray();

        for (const token of tokens) {
            console.log(`Refreshing ${token.symbol} on ${token.chainId}`);
            const tokenData = await fetchTokenData(token.address, token.chainId);

            await collection.updateOne(
                { address: token.address, chainId: token.chainId },
                { 
                    $set: {
                        price: tokenData.price,
                        price_change_24h: tokenData.price_change_24h,
                        market_cap: tokenData.market_cap,
                        liquidity: tokenData.liquidity,
                        volume_24h: tokenData.volume_24h,
                        vol_mc_ratio: tokenData.vol_mc_ratio,
                        liq_mc_ratio: tokenData.liq_mc_ratio,
                        vol_liq_ratio: tokenData.vol_liq_ratio,
                        timestamp: new Date()
                    }
                }
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error refreshing tokens:', error);
        res.status(500).json({ error: error.message });
    }
} 