import React, { useState, useEffect } from 'react';
import { Database } from './db';

function App() {
  const [db] = useState(new Database());

  useEffect(() => {
    // Example: fetch token list when component mounts
    const fetchTokens = async () => {
      try {
        const tokens = await db.getTokenList();
        console.log('Tokens:', tokens);
      } catch (error) {
        console.error('Error fetching tokens:', error);
      }
    };
    fetchTokens();
  }, [db]);

  return (
    <div className="App">
      <h1>Token Dashboard</h1>
    </div>
  );
}

export default App; 