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

module.exports = { connectToDatabase }; 