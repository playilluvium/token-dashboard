document.addEventListener('DOMContentLoaded', () => {
    const db = new Database();
    
    // Populate chain selection
    populateChainSelect();
    
    // Add Token Form Handler
    const addTokenForm = document.getElementById('addTokenForm');
    addTokenForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const symbol = document.getElementById('tokenSymbol').value.trim();
        const address = document.getElementById('tokenAddress').value.trim();
        const chainId = document.getElementById('chainId').value;
        const submitButton = addTokenForm.querySelector('button[type="submit"]');
        const successMessage = document.getElementById('addTokenSuccess');
        
        if (!symbol || !address) {
            alert('Please fill in both fields');
            return;
        }
        
        try {
            // Disable submit button and show loading state
            submitButton.disabled = true;
            submitButton.innerHTML = `
                <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding...
            `;
            
            db.chainId = chainId;
            const response = await db.addToken(symbol, address);
            if (!response.ok && response.error) {
                throw new Error(response.error);
            }
            
            // Clear the form
            addTokenForm.reset();
            
            // Show success message
            if (successMessage) {
                successMessage.textContent = `✓ ${symbol} token added successfully!`;
                successMessage.classList.remove('hidden');
                successMessage.classList.add('text-green-600');
                
                // Hide message after 3 seconds
                setTimeout(() => {
                    successMessage.classList.add('hidden');
                }, 3000);
            }
            
            // Refresh the current tab
            const activeTab = document.querySelector('.tab-button.active');
            loadTabContent(activeTab.getAttribute('data-tab'));
        } catch (error) {
            console.error('Error adding token:', error);
            alert(error.message || 'Error adding token. Please try again.');
        } finally {
            // Reset submit button
            submitButton.disabled = false;
            submitButton.innerHTML = 'Add Token';
        }
    });

    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.add('hidden'));
            
            button.classList.add('active');
            document.getElementById(tabId).classList.remove('hidden');
            
            // Load content based on active tab
            loadTabContent(tabId);
        });
    });

    async function loadTabContent(tabId) {
        try {
            let content = '';
            
            switch(tabId) {
                case 'daily':
                    const dailyData = await db.getDailyData();
                    content = createDailyView(dailyData);
                    break;
                    
                case 'historical':
                    const historicalData = await db.getHistoricalData();
                    createHistoricalView(historicalData);
                    break;
                    
                case 'tokelist':
                    const listData = await db.getTokenList();
                    content = createTokenList(listData);
                    break;
            }
            
            if (content) { // Only set innerHTML if content is not empty
                document.getElementById(`${tabId}-content`).innerHTML = content;
            }
        } catch (error) {
            console.error('Error loading tab content:', error);
        }
    }

    function createDailyView(data) {
        const formatNumber = (num) => {
            if (num === null || num === undefined || num === 0) return '0.00';
            if (num < 0.01) return num.toExponential(2);
            if (num < 1) return num.toFixed(4);
            return num.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        };

        const formatRatio = (ratio) => {
            if (ratio === null || ratio === undefined) return '0.00%';
            return (ratio * 100).toFixed(2) + '%';
        };

        const getRatioColor = (ratio, type) => {
            if (ratio === 0) return 'text-gray-500';
            
            switch(type) {
                case 'vol_mc':
                    return ratio > 0.05 ? 'text-green-600' : 'text-red-600';
                case 'liq_mc':
                    return ratio > 0.03 ? 'text-green-600' : 'text-red-600';
                case 'vol_liq':
                    return ratio > 1 ? 'text-green-600' : 'text-red-600';
                default:
                    return '';
            }
        };

        // Add a function to format price change
        const formatPriceChange = (change) => {
            if (change === null || change === undefined) return '0.00%';
            const formatted = change.toFixed(2) + '%';
            return `<span class="${change >= 0 ? 'text-green-600' : 'text-red-600'}">${change >= 0 ? '+' : ''}${formatted}</span>`;
        };

        return `
            <div class="overflow-x-auto">
                <div class="mb-4 flex justify-end">
                    <button 
                        onclick="refreshTokenData()"
                        class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh Data
                    </button>
                </div>
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="px-4 py-2">Updated</th>
                            <th class="px-4 py-2">COIN</th>
                            <th class="px-4 py-2">Chain</th>
                            <th class="px-4 py-2">Price</th>
                            <th class="px-4 py-2">24h Change</th>
                            <th class="px-4 py-2">MC</th>
                            <th class="px-4 py-2">Liquidity</th>
                            <th class="px-4 py-2">Volume (24h)</th>
                            <th class="px-4 py-2">Vol/MC</th>
                            <th class="px-4 py-2">Liq/MC</th>
                            <th class="px-4 py-2">Vol/Liq</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(item => `
                            <tr class="border-b hover:bg-gray-50">
                                <td class="px-4 py-2 text-sm">${new Date(item.timestamp).toLocaleString()}</td>
                                <td class="px-4 py-2 font-medium">${item.symbol}</td>
                                <td class="px-4 py-2">${item.chainId}</td>
                                <td class="px-4 py-2">$${formatNumber(item.price)}</td>
                                <td class="px-4 py-2">${formatPriceChange(item.price_change_24h)}</td>
                                <td class="px-4 py-2">$${formatNumber(item.market_cap)}</td>
                                <td class="px-4 py-2">$${formatNumber(item.liquidity)}</td>
                                <td class="px-4 py-2">$${formatNumber(item.volume_24h)}</td>
                                <td class="px-4 py-2 ${getRatioColor(item.vol_mc_ratio, 'vol_mc')}">${formatRatio(item.vol_mc_ratio)}</td>
                                <td class="px-4 py-2 ${getRatioColor(item.liq_mc_ratio, 'liq_mc')}">${formatRatio(item.liq_mc_ratio)}</td>
                                <td class="px-4 py-2 ${getRatioColor(item.vol_liq_ratio, 'vol_liq')}">${formatRatio(item.vol_liq_ratio)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function createHistoricalView(data) {
        const formatNumber = (num) => {
            if (num === null || num === undefined || num === 0) return '0.00';
            if (num < 0.01) return num.toExponential(2);
            if (num < 1) return num.toFixed(4);
            return num.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        };

        const formatRatio = (ratio) => {
            if (ratio === null || ratio === undefined) return '0.00%';
            return (ratio * 100).toFixed(2) + '%';
        };

        const getRatioColor = (ratio, type) => {
            if (ratio === 0) return 'text-gray-500';
            
            switch(type) {
                case 'vol_mc':
                    return ratio > 0.05 ? 'text-green-600' : 'text-red-600';
                case 'liq_mc':
                    return ratio > 0.03 ? 'text-green-600' : 'text-red-600';
                case 'vol_liq':
                    return ratio > 1 ? 'text-green-600' : 'text-red-600';
                default:
                    return '';
            }
        };

        const getGridClass = (totalTokens) => {
            switch(totalTokens) {
                case 1:
                    return 'grid-cols-1';  // Full width
                case 2:
                    return 'grid-cols-2';  // Two columns
                default:
                    return 'grid-cols-3';  // Three columns max
            }
        };

        const accordion = document.getElementById('tokenAccordion');
        accordion.innerHTML = `
            <div class="grid ${getGridClass(data.length)} gap-4">
                ${data.map((token, index) => `
                    <div class="bg-white rounded-lg shadow overflow-hidden token-card" 
                         data-address="${token.address}" 
                         data-chain="${token.chainId}"
                         data-symbol="${token.symbol}">
                        <div class="header p-4 cursor-pointer flex justify-between items-center hover:bg-gray-50 border-b">
                            <div>
                                <h3 class="font-medium text-lg">${token.symbol}</h3>
                                <p class="text-sm text-gray-500">${token.chainId}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-medium">$${formatNumber(token.price)}</p>
                                <p class="text-sm text-gray-500">${new Date(token.timestamp).toLocaleString()}</p>
                            </div>
                        </div>
                        <div class="token-details hidden">
                            <div class="p-4 space-y-2 bg-gray-50">
                                <div class="flex justify-between items-center mb-2">
                                    <div class="flex space-x-2">
                                        <button class="time-range-btn px-3 py-1 text-sm rounded bg-blue-500 text-white" data-range="48h">48H</button>
                                        <button class="time-range-btn px-3 py-1 text-sm rounded bg-gray-300" data-range="1M">1M</button>
                                        <button class="time-range-btn px-3 py-1 text-sm rounded bg-gray-300" data-range="ALL">ALL</button>
                                    </div>
                                </div>
                                <div class="h-40 mb-4 relative">
                                    <canvas id="chart-${index}"></canvas>
                                </div>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <p class="text-sm text-gray-500">Market Cap</p>
                                        <p class="font-medium">$${formatNumber(token.market_cap)}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm text-gray-500">Liquidity</p>
                                        <p class="font-medium">$${formatNumber(token.liquidity)}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm text-gray-500">Volume (24h)</p>
                                        <p class="font-medium">$${formatNumber(token.volume_24h)}</p>
                                    </div>
                                </div>
                                <div class="border-t pt-2 mt-2">
                                    <div class="grid grid-cols-3 gap-2">
                                        <div>
                                            <p class="text-sm text-gray-500">Vol/MC</p>
                                            <p class="font-medium ${getRatioColor(token.vol_mc_ratio, 'vol_mc')}">
                                                ${formatRatio(token.vol_mc_ratio)}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="text-sm text-gray-500">Liq/MC</p>
                                            <p class="font-medium ${getRatioColor(token.liq_mc_ratio, 'liq_mc')}">
                                                ${formatRatio(token.liq_mc_ratio)}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="text-sm text-gray-500">Vol/Liq</p>
                                            <p class="font-medium ${getRatioColor(token.vol_liq_ratio, 'vol_liq')}">
                                                ${formatRatio(token.vol_liq_ratio)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        // Initialize click handlers for all tokens
        document.querySelectorAll('.token-card').forEach((element, index) => {
            const tokenData = {
                symbol: element.dataset.symbol,
                address: element.dataset.address,
                chainId: element.dataset.chain
            };
            
            const detailsDiv = element.querySelector('.token-details');
            const chartId = `chart-${index}`;
            
            element.querySelector('.header').addEventListener('click', async () => {
                const isHidden = detailsDiv.classList.contains('hidden');
                detailsDiv.classList.toggle('hidden');
                
                if (!isHidden) return; // Don't recreate chart if closing
                
                console.log('Creating chart for token:', tokenData);
                
                try {
                    const response = await fetch(`/api/tokens/${encodeURIComponent(tokenData.address)}/${encodeURIComponent(tokenData.chainId)}/prices?range=48h`);
                    const priceData = await response.json();
                    console.log('Price data received:', priceData);

                    if (!priceData || priceData.length === 0) {
                        console.log('No price data available for:', tokenData.symbol);
                        return;
                    }

                    // Format the data for the chart and ensure UTC parsing
                    const chartData = priceData.map(d => ({
                        x: new Date(d.timestamp + 'Z'),  // Add 'Z' to ensure UTC parsing
                        y: d.price
                    }));

                    console.log('Formatted chart data:', chartData);

                    const canvas = document.getElementById(chartId);
                    if (!canvas) {
                        console.error('Canvas element not found:', chartId);
                        return;
                    }

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        console.error('Could not get 2d context for canvas:', chartId);
                        return;
                    }

                    // Destroy existing chart if it exists
                    const existingChart = Chart.getChart(chartId);
                    if (existingChart) {
                        existingChart.destroy();
                    }

                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            datasets: [{
                                label: 'Price USD',
                                data: chartData,
                                borderColor: 'rgb(75, 192, 192)',
                                tension: 0.1,
                                pointRadius: 2,
                                borderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: {
                                intersect: false,
                                mode: 'index'
                            },
                            plugins: {
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            return new Intl.NumberFormat('en-US', {
                                                style: 'currency',
                                                currency: 'USD'
                                            }).format(context.raw.y);
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    type: 'time',
                                    time: {
                                        unit: 'hour',
                                        displayFormats: {
                                            hour: 'MMM d, HH:mm',
                                            day: 'MMM d',
                                            week: 'MMM d, yyyy'
                                        },
                                        tooltipFormat: 'MMM d, yyyy HH:mm',
                                        parser: 'yyyy-MM-dd HH:mm:ss'
                                    },
                                    display: true,
                                    grid: {
                                        display: false
                                    },
                                    adapters: {
                                        date: {
                                            zone: 'UTC'
                                        }
                                    }
                                },
                                y: {
                                    type: 'linear',
                                    display: true,
                                    position: 'left',
                                    beginAtZero: false,
                                    grid: {
                                        color: 'rgba(0,0,0,0.1)'
                                    }
                                }
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error creating chart:', error);
                }
            });

            element.querySelectorAll('.time-range-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const range = e.target.dataset.range;
                    
                    // Update button styles
                    element.querySelectorAll('.time-range-btn').forEach(b => {
                        b.classList.remove('bg-blue-500', 'text-white');
                        b.classList.add('bg-gray-300');
                    });
                    e.target.classList.remove('bg-gray-300');
                    e.target.classList.add('bg-blue-500', 'text-white');

                    // Fetch data for the selected range
                    try {
                        const response = await fetch(`/api/tokens/${encodeURIComponent(tokenData.address)}/${encodeURIComponent(tokenData.chainId)}/prices?range=${range}`);
                        const priceData = await response.json();

                        if (!priceData || priceData.length === 0) {
                            console.log('No price data available for:', tokenData.symbol);
                            return;
                        }

                        // Update the chart
                        const chart = Chart.getChart(chartId);
                        if (chart) {
                            chart.data.datasets[0].data = priceData.map(d => ({
                                x: new Date(d.timestamp + 'Z'),  // Add 'Z' to ensure UTC parsing
                                y: d.price
                            }));
                            
                            // Adjust time unit based on range
                            const timeUnit = range === '48h' ? 'hour' : range === '1M' ? 'day' : 'week';
                            chart.options.scales.x.time.unit = timeUnit;
                            
                            chart.update();
                        }
                    } catch (error) {
                        console.error('Error updating chart:', error);
                    }
                });
            });
        });
    }

    function createTokenList(data) {
        return `
            <div class="overflow-x-auto">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="px-4 py-2">Symbol</th>
                            <th class="px-4 py-2">Address</th>
                            <th class="px-4 py-2">Chain</th>
                            <th class="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(item => `
                            <tr class="border-b">
                                <td class="px-4 py-2 font-medium">${item.symbol}</td>
                                <td class="px-4 py-2 font-mono text-sm">${item.address}</td>
                                <td class="px-4 py-2">${item.chainId}</td>
                                <td class="px-4 py-2">
                                    <button 
                                        onclick="deleteToken('${item.address}', '${item.chainId}', '${item.symbol}')"
                                        class="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Update deleteToken function
    window.deleteToken = async (address, chainId, symbol) => {
        if (confirm(`Are you sure you want to delete ${symbol}?`)) {
            try {
                const response = await fetch(`/api/tokens/${address}/${chainId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) throw new Error('Failed to delete token');
                await loadTabContent('tokelist'); // Refresh the list
            } catch (error) {
                console.error('Error deleting token:', error);
                alert('Error deleting token. Please try again.');
            }
        }
    };

    // Make refreshTokenData function available globally
    window.refreshTokenData = async () => {
        try {
            const response = await fetch('/api/tokens/refresh', { method: 'POST' });
            if (!response.ok) throw new Error('Failed to refresh token data');
            await loadTabContent('daily'); // Reload the daily view
            alert('Token data refreshed successfully!');
        } catch (error) {
            console.error('Error refreshing token data:', error);
            alert('Error refreshing token data. Please try again.');
        }
    };

    // Add this function to fetch and populate chains
    async function populateChainSelect() {
        try {
            // Define all known chains from DexScreener
            const knownChains = {
                'ethereum': 'Ethereum',
                'bsc': 'BSC',
                'polygon': 'Polygon',
                'arbitrum': 'Arbitrum',
                'optimism': 'Optimism',
                'base': 'Base',
                'avalanche': 'Avalanche',
                'fantom': 'Fantom',
                'cronos': 'Cronos',
                'kava': 'Kava',
                'linea': 'Linea',
                'mantle': 'Mantle',
                'scroll': 'Scroll',
                'manta': 'Manta',
                'zksync': 'zkSync Era',
                'metis': 'Metis',
                'celo': 'Celo',
                'polygon_zkevm': 'Polygon zkEVM',
                'moonriver': 'Moonriver',
                'moonbeam': 'Moonbeam',
                'harmony': 'Harmony',
                'aurora': 'Aurora',
                'telos': 'Telos',
                'heco': 'HECO',
                'okc': 'OKC',
                'gnosis': 'Gnosis',
                'canto': 'Canto',
                'core': 'CORE',
                'klaytn': 'Klaytn',
                'arbitrum_nova': 'Arbitrum Nova',
                'fusion': 'Fusion',
                'tomb': 'Tomb Chain',
                'thundercore': 'ThunderCore',
                'oasis': 'Oasis',
                'ethereum_pow': 'EthereumPoW',
                'kcc': 'KCC',
                'milkomeda': 'Milkomeda',
                'syscoin': 'Syscoin',
                'wan': 'Wanchain',
                'cube': 'Cube',
                'step': 'Step Network',
                'nova_network': 'Nova Network',
                'meter': 'Meter',
                'evmos': 'Evmos',
                'fuse': 'Fuse',
                'elastos': 'Elastos',
                'shiden': 'Shiden',
                'reef': 'Reef',
                'velas': 'Velas',
                'solana': 'Solana',
                'sui': 'Sui',
                'aptos': 'Aptos',
                'near': 'NEAR',
                'carbon': 'Carbon',
                'mode': 'Mode',
                'blast': 'Blast',
                'merlin': 'Merlin',
                'zeta': 'ZetaChain',
                'mixin': 'Mixin'
            };

            // Get the select element
            const chainSelect = document.getElementById('chainId');
            
            // Clear existing options
            chainSelect.innerHTML = '';
            
            // Add each chain as an option
            Object.entries(knownChains)
                .sort((a, b) => a[1].localeCompare(b[1])) // Sort by display name
                .forEach(([value, text]) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.text = text;
                    chainSelect.appendChild(option);
                });

            // Set Base as default
            const baseOption = chainSelect.querySelector('option[value="base"]');
            if (baseOption) {
                baseOption.selected = true;
            }
        } catch (error) {
            console.error('Error setting up chain select:', error);
            // Fallback to Base chain if something goes wrong
            const chainSelect = document.getElementById('chainId');
            chainSelect.innerHTML = '<option value="base">Base</option>';
        }
    }

    // Load initial tab content
    loadTabContent('daily');
}); 