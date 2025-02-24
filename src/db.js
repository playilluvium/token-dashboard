const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }

    await client.connect();
    const db = client.db('tokendb');
    cachedDb = db;
    return db;
}

export class Database {
    constructor() {
        this.chainId = 'base';  // Default to Base chain
    }

    async getTokenList() {
        const response = await fetch('/api/tokens?view=list');
        if (!response.ok) throw new Error('Failed to fetch tokens');
        return response.json();
    }

    // ... rest of the Database class methods
}

module.exports = { connectToDatabase }; 