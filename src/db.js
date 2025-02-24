export class Database {
    constructor() {
        this.chainId = 'base';
    }

    async getTokenList() {
        const response = await fetch('/api/tokens?view=list');
        if (!response.ok) throw new Error('Failed to fetch tokens');
        return response.json();
    }

    async getDailyData() {
        const response = await fetch('/api/tokens?view=daily');
        if (!response.ok) throw new Error('Failed to fetch tokens');
        return response.json();
    }

    async getHistoricalData() {
        const response = await fetch('/api/tokens?view=daily');
        if (!response.ok) throw new Error('Failed to fetch historical data');
        const data = await response.json();

        const tokensWithAddresses = await Promise.all(
            data.map(async token => {
                const listResponse = await fetch('/api/tokens?view=list');
                const listData = await listResponse.json();
                const tokenInfo = listData.find(t => t.symbol === token.symbol && t.chainId === token.chainId);
                return {
                    ...token,
                    address: tokenInfo?.address || ''
                };
            })
        );

        return tokensWithAddresses;
    }

    async addToken(symbol, address) {
        const response = await fetch('/api/tokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                symbol, 
                address,
                chainId: this.chainId
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to add token');
        return data;
    }

    async deleteToken(symbol) {
        const response = await fetch(`/api/tokens/${symbol}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete token');
        return response.json();
    }

    async refreshTokenData() {
        const response = await fetch('/api/tokens/refresh', {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to refresh token data');
        return response.json();
    }
} 