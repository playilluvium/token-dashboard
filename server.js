const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
let fetch;
(async () => {
    fetch = (await import('node-fetch')).default;
})();
const app = express();
const port = 3000;

// Create database connection
const db = new sqlite3.Database('dashboard.db', (err) => {
    if (err) {
        console.error('Error creating database:', err);
    } else {
        console.log('Database created successfully');
    }
});

// Create tables and insert initial data
db.serialize(() => {
    console.log('Creating tables and inserting initial data...');
    
    // Drop the existing table if it exists
    db.run(`DROP TABLE IF EXISTS tokens`);
    
    // Create the table with the new schema
    db.run(`CREATE TABLE tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        address TEXT NOT NULL,
        chainId TEXT NOT NULL DEFAULT 'base',
        price REAL DEFAULT 0,
        price_change_24h REAL DEFAULT 0,
        market_cap REAL DEFAULT 0,
        liquidity REAL DEFAULT 0,
        volume_24h REAL DEFAULT 0,
        vol_mc_ratio REAL DEFAULT 0,
        liq_mc_ratio REAL DEFAULT 0,
        vol_liq_ratio REAL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create the historical prices table
    db.run(`CREATE TABLE IF NOT EXISTS token_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_address TEXT NOT NULL,
        chain_id TEXT NOT NULL,
        price REAL NOT NULL,
        volume REAL,
        liquidity REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(token_address, chain_id, timestamp)
    )`);
});

// Parse JSON bodies
app.use(express.json());

// Serve static files from the root directory
app.use(express.static('./'));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Create a limiter
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs (leaving some buffer)
    message: 'Too many requests from this IP, please try again after a minute'
});

// Create a stricter limiter for token searches
const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // limit each IP to 30 searches per minute
    message: 'Too many search requests from this IP, please try again after a minute'
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Apply stricter limit to token search endpoint
app.use('/api/tokens', searchLimiter);

// API endpoint to get tokens
app.get('/api/tokens', (req, res) => {
    const view = req.query.view || 'list';

    let query = '';
    if (view === 'daily') {
        query = `
            SELECT 
                symbol,
                address,
                chainId,
                price,
                price_change_24h,
                market_cap,
                liquidity,
                volume_24h,
                timestamp,
                vol_mc_ratio,
                liq_mc_ratio,
                vol_liq_ratio
            FROM tokens 
            ORDER BY timestamp DESC
        `;
    } else {
        query = `
            SELECT symbol, address, chainId
            FROM tokens 
            ORDER BY LOWER(symbol) ASC
        `;
    }

    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Query result:', rows);
        res.json(rows);
    });
});

async function fetchHistoricalData(address, chainId, pair) {
    try {
        const mainPair = pair;
        const currentPrice = parseFloat(mainPair.priceUsd);
        const now = Date.now();

        if (isNaN(currentPrice)) {
            console.error('Invalid current price:', mainPair.priceUsd);
            return [];
        }

        // Create price points array with unique timestamps
        const pricePoints = new Map();

        // Add historical points
        if (mainPair.priceChange) {
            // 24 hours ago
            if (mainPair.priceChange.h24 !== undefined) {
                const timestamp24h = Math.floor((now - (24 * 60 * 60 * 1000)) / 1000) * 1000;
                const price24h = currentPrice / (1 + (mainPair.priceChange.h24 / 100));
                pricePoints.set(timestamp24h, {
                    timestamp: timestamp24h,
                    price: price24h,
                    volume: parseFloat(mainPair.volume?.h24 || 0),
                    liquidity: parseFloat(mainPair.liquidity?.usd || 0)
                });
            }

            // 6 hours ago
            if (mainPair.priceChange.h6 !== undefined) {
                const timestamp6h = Math.floor((now - (6 * 60 * 60 * 1000)) / 1000) * 1000;
                const price6h = currentPrice / (1 + (mainPair.priceChange.h6 / 100));
                pricePoints.set(timestamp6h, {
                    timestamp: timestamp6h,
                    price: price6h,
                    volume: parseFloat(mainPair.volume?.h6 || 0),
                    liquidity: parseFloat(mainPair.liquidity?.usd || 0)
                });
            }

            // 1 hour ago
            if (mainPair.priceChange.h1 !== undefined) {
                const timestamp1h = Math.floor((now - (1 * 60 * 60 * 1000)) / 1000) * 1000;
                const price1h = currentPrice / (1 + (mainPair.priceChange.h1 / 100));
                pricePoints.set(timestamp1h, {
                    timestamp: timestamp1h,
                    price: price1h,
                    volume: parseFloat(mainPair.volume?.h1 || 0),
                    liquidity: parseFloat(mainPair.liquidity?.usd || 0)
                });
            }
        }

        // Add current price point
        const currentTimestamp = Math.floor(now / 1000) * 1000;
        pricePoints.set(currentTimestamp, {
            timestamp: currentTimestamp,
            price: currentPrice,
            volume: parseFloat(mainPair.volume?.h24 || 0),
            liquidity: parseFloat(mainPair.liquidity?.usd || 0)
        });

        // Convert to array and sort by timestamp
        const sortedPoints = Array.from(pricePoints.values())
            .sort((a, b) => a.timestamp - b.timestamp);

        // Store historical prices
        if (sortedPoints.length > 0) {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO token_prices (
                    token_address, 
                    chain_id, 
                    price, 
                    volume,
                    liquidity,
                    timestamp
                ) VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch', 'utc'))
            `);

            sortedPoints.forEach(point => {
                stmt.run(
                    address,
                    chainId,
                    point.price,
                    point.volume,
                    point.liquidity,
                    Math.floor(point.timestamp / 1000)
                );
            });

            stmt.finalize();
        }

        console.log('Generated price points:', sortedPoints.map(p => ({
            time: new Date(p.timestamp).toISOString(),
            price: p.price.toFixed(6)
        })));

        return sortedPoints;
    } catch (error) {
        console.error('Error fetching historical data:', error);
        return [];
    }
}

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

        // Get historical data
        await fetchHistoricalData(address, chainId, pair);

        // For existing tokens, calculate price change from database
        let priceChange24h = parseFloat(pair.priceChange?.h24 || 0);
        
        try {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const oldPrice = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT price 
                    FROM token_prices 
                    WHERE token_address = ? 
                    AND chain_id = ? 
                    AND timestamp <= datetime(?, 'unixepoch')
                    ORDER BY timestamp DESC 
                    LIMIT 1
                `, [
                    address, 
                    chainId, 
                    Math.floor(yesterday.getTime() / 1000)
                ], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            if (oldPrice) {
                // Calculate price change from database if we have historical data
                const currentPrice = parseFloat(pair.priceUsd);
                priceChange24h = ((currentPrice - oldPrice.price) / oldPrice.price) * 100;
            }
        } catch (error) {
            console.log('Using API price change as fallback:', priceChange24h);
        }

        // Return current token data
        return {
            price: parseFloat(pair.priceUsd),
            market_cap: parseFloat(pair.fdv || 0),
            liquidity: parseFloat(pair.liquidity?.usd || 0),
            volume_24h: parseFloat(pair.volume?.h24 || 0),
            price_change_24h: priceChange24h,
            vol_mc_ratio: parseFloat(pair.volume?.h24 || 0) / parseFloat(pair.fdv || 1),
            liq_mc_ratio: parseFloat(pair.liquidity?.usd || 0) / parseFloat(pair.fdv || 1),
            vol_liq_ratio: parseFloat(pair.volume?.h24 || 0) / parseFloat(pair.liquidity?.usd || 1)
        };
    } catch (error) {
        console.error('Error fetching token data:', error);
        throw error;
    }
}

// API endpoint to add a token
app.post('/api/tokens', async (req, res) => {
    const { symbol, address, chainId } = req.body;
    console.log('Adding new token:', { symbol, address, chainId });

    try {
        // First check if token with this address already exists
        const existingToken = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM tokens WHERE address = ? AND chainId = ?',
                [address, chainId],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                }
            );
        });

        if (existingToken) {
            return res.status(400).json({ 
                error: `Token with address ${address} already exists on ${chainId} chain` 
            });
        }

        // Fetch token data from DexScreener
        const tokenData = await fetchTokenData(address, chainId);

        // Insert new token
        db.run(`
            INSERT INTO tokens (
                symbol, 
                address,
                chainId,
                price,
                price_change_24h,
                market_cap,
                liquidity,
                volume_24h,
                vol_mc_ratio,
                liq_mc_ratio,
                vol_liq_ratio
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, 
            [
                symbol, 
                address,
                chainId,
                tokenData?.price || 0,
                tokenData?.price_change_24h || 0,
                tokenData?.market_cap || 0,
                tokenData?.liquidity || 0,
                tokenData?.volume_24h || 0,
                tokenData?.vol_mc_ratio || 0,
                tokenData?.liq_mc_ratio || 0,
                tokenData?.vol_liq_ratio || 0
            ], 
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    res.status(500).json({ error: err.message });
                    return;
                }
                console.log('Token added successfully with ID:', this.lastID);
                res.json({ id: this.lastID });
            }
        );
    } catch (error) {
        console.error('Error adding token:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to delete a token
app.delete('/api/tokens/:address/:chainId', (req, res) => {
    const { address, chainId } = req.params;
    console.log('Deleting token:', { address, chainId });
    
    db.run('DELETE FROM tokens WHERE address = ? AND chainId = ?', 
        [address, chainId], 
        function(err) {
            if (err) {
                console.error('Database error:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            console.log('Token deleted successfully');
            res.json({ success: true });
        }
    );
});

// API endpoint to get historical prices
app.get('/api/tokens/:address/:chainId/prices', async (req, res) => {
    const { address, chainId } = req.params;
    const range = req.query.range || '48h';

    console.log('Fetching prices for:', { address, chainId, range });

    try {
        // Get token data and fetch current price
        const token = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM tokens WHERE address = ? AND chainId = ?', 
                [address, chainId], 
                (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                }
            );
        });

        if (token) {
            // Fetch fresh data including historical prices
            const tokenData = await fetchTokenData(address, chainId);
            if (tokenData) {
                console.log('Fresh token data fetched');
            }
        }

        // Build query based on range
        let timeFilter;
        let groupBy = '';
        
        switch(range) {
            case '48h':
                timeFilter = "datetime('now', '-2 days')";
                break;
            case '1M':
                timeFilter = "datetime('now', '-30 days')";
                groupBy = 'GROUP BY date(timestamp)';
                break;
            case 'ALL':
                timeFilter = "datetime('now', '-10 years')";
                groupBy = 'GROUP BY strftime("%Y-%W", timestamp)';
                break;
            default:
                timeFilter = "datetime('now', '-2 days')";
        }

        // Get historical prices
        const rows = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    AVG(price) as price,
                    SUM(volume) as volume,
                    AVG(liquidity) as liquidity,
                    strftime('%Y-%m-%d %H:%M:%S', MIN(timestamp)) as timestamp
                FROM token_prices
                WHERE token_address = ? 
                AND chain_id = ?
                AND timestamp >= ${timeFilter}
                ${groupBy}
                ORDER BY timestamp ASC
            `, [address, chainId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        console.log('Historical prices from DB:', rows);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching historical prices:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to refresh token data
app.post('/api/tokens/refresh', async (req, res) => {
    try {
        const tokens = await new Promise((resolve, reject) => {
            db.all('SELECT symbol, address, chainId FROM tokens', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        console.log('Refreshing data for tokens:', tokens);
        for (const token of tokens) {
            console.log(`Fetching data for ${token.symbol} on chain ${token.chainId}`);
            const tokenData = await fetchTokenData(token.address, token.chainId);
            if (tokenData) {
                // Update current token data including price change
                await new Promise((resolve, reject) => {
                    db.run(`
                        UPDATE tokens 
                        SET price = ?, 
                            price_change_24h = ?,
                            market_cap = ?, 
                            liquidity = ?, 
                            volume_24h = ?, 
                            vol_mc_ratio = ?, 
                            liq_mc_ratio = ?, 
                            vol_liq_ratio = ?,
                            timestamp = CURRENT_TIMESTAMP
                        WHERE address = ? AND chainId = ?
                    `, [
                        tokenData.price,
                        tokenData.price_change_24h,
                        tokenData.market_cap,
                        tokenData.liquidity,
                        tokenData.volume_24h,
                        tokenData.vol_mc_ratio,
                        tokenData.liq_mc_ratio,
                        tokenData.vol_liq_ratio,
                        token.address,
                        token.chainId
                    ], (err) => {
                        if (err) reject(err);
                        console.log('Updated token:', token.symbol);
                        resolve();
                    });
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error refreshing token data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Schedule token data updates at 00:00 and 12:00 UTC
cron.schedule('0 0,12 * * *', async () => {
    try {
        await updateTokenData();
        console.log('Token data updated successfully at', new Date().toISOString());
    } catch (error) {
        console.error('Error updating token data:', error);
    }
});

async function updateTokenData() {
    // Implement your token data fetching logic here
    // Store the data in your database
}

// API endpoint to get token history
app.get('/api/token-history', async (req, res) => {
    try {
        // Implement your database query to fetch token history
        const tokenHistory = await db.collection('tokens').find().sort({ timestamp: -1 }).toArray();
        res.json(tokenHistory);
    } catch (error) {
        console.error('Error fetching token history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const server = createServer(app);
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

// Export the express app
module.exports = app; 