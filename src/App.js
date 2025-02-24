import React, { useState, useEffect } from 'react';
import { Database } from './db';

function App() {
  const [db] = useState(new Database());
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tokenList = await db.getTokenList();
        const dailyData = await db.getDailyData();
        setTokens(dailyData);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, [db]);

  if (loading) return <div className="text-center p-4">Loading...</div>;
  if (error) return <div className="text-center p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="App container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Token Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tokens.map((token, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-xl font-semibold">{token.symbol}</h2>
            <p className="text-gray-600">Chain: {token.chainId}</p>
            <p className="text-lg font-bold mt-2">${token.price?.toFixed(2) || 'N/A'}</p>
            {token.address && (
              <p className="text-sm text-gray-500 mt-2 truncate">
                Address: {token.address}
              </p>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => db.refreshTokenData()}
        className="mt-6 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Refresh Data
      </button>
    </div>
  );
}

export default App; 