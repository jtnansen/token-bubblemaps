// API endpoint for token holders
const NANSEN_HOLDERS_API_URL = '/api/nansen/api/v1/tgm/holders';

export async function fetchTokenHolders(tokenAddress, chain = 'solana', perPage = 100) {
  console.log('🪙 Fetching token holders:');
  console.log('   Token:', tokenAddress);
  console.log('   Chain:', chain);
  console.log('   Per page:', perPage);

  if (!tokenAddress) {
    throw new Error('No token address provided');
  }

  const requestBody = {
    "chain": chain,
    "token_address": tokenAddress,
    "aggregate_by_entity": false,
    "label_type": "all_holders",
    "pagination": {
      "page": 1,
      "per_page": perPage
    },
    "filters": {
      "token_amount": {
        "min": 1
      }
    },
    "order_by": [
      {
        "field": "token_amount",
        "direction": "DESC"
      }
    ]
  };

  console.log('📡 Holders API request body:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(NANSEN_HOLDERS_API_URL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    console.log('🌐 Response status:', response.status);

    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorData = await response.json();
        errorMessage = JSON.stringify(errorData);
      } catch {
        errorMessage = await response.text();
      }
      console.error('Holders API Response not OK:', {
        status: response.status,
        statusText: response.statusText,
        responseBody: errorMessage
      });
      throw new Error(`Holders API request failed (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    console.log('✅ Holders API Response:', data);

    // Parse response - holders are in data.data array
    let holders = [];
    if (data.data && Array.isArray(data.data)) {
      holders = data.data;
    } else if (Array.isArray(data)) {
      holders = data;
    }

    if (holders.length > 0) {
      console.log(`📊 Found ${holders.length} token holders`);
      console.log('🎯 Sample holder fields:', Object.keys(holders[0]));
      console.log('🎯 Sample holder:', holders[0]);
    } else {
      console.log('⚠️ No holders found for this token');
    }

    return {
      data: holders,
      pagination: data.pagination,
      tokenAddress,
      chain
    };
  } catch (error) {
    console.error('❌ Error fetching token holders:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Fetch counterparties for a holder to find interactions with other holders
export async function fetchHolderCounterparties(holderAddress, chain = 'solana', timeframe = '1Y') {

  // Calculate date range (Nansen API limit: max 1 year)
  const today = new Date();
  const daysBack = {
    '30D': 30,
    '90D': 90,
    '180D': 180,
    '1Y': 365
  };

  const startDate = new Date();
  // Cap at 365 days to respect API limit
  const maxDays = Math.min(daysBack[timeframe] || 365, 365);
  startDate.setDate(today.getDate() - maxDays);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fromDate = formatDate(startDate);
  const toDate = formatDate(today);

  const requestBody = {
    "parameters": {
      "walletAddresses": [holderAddress],
      "chain": chain,
      "sourceInput": "Combined",
      "groupBy": "wallet",
      "timeRange": {
        "from": fromDate,
        "to": toDate
      }
    },
    "pagination": {
      "page": 1,
      "recordsPerPage": 100
    }
  };

  try {
    console.log('📡 Counterparty API request:', {
      address: holderAddress.slice(0, 8) + '...',
      chain,
      timeframe,
      fromDate,
      toDate
    });

    const response = await fetch('/api/nansen/api/beta/profiler/address/counterparties', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📡 Counterparty API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Counterparties API failed (${response.status}):`, errorText);
      throw new Error(`Counterparties API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📡 Counterparty API response:', {
      address: holderAddress.slice(0, 8) + '...',
      dataKeys: Object.keys(data),
      isArray: Array.isArray(data),
      fullResponse: data
    });

    // Handle both response formats: { counterparties: [...] } or just [...]
    let counterparties = [];
    if (Array.isArray(data)) {
      // Response is directly an array
      counterparties = data;
      console.log('✅ Found counterparties (array format):', counterparties.length);
    } else if (data.counterparties && Array.isArray(data.counterparties)) {
      // Response is { counterparties: [...] }
      counterparties = data.counterparties;
      console.log('✅ Found counterparties (object format):', counterparties.length);
    } else {
      console.warn('⚠️ Unexpected response format:', data);
    }

    if (counterparties.length > 0) {
      console.log('📊 Sample counterparty:', {
        fields: Object.keys(counterparties[0]),
        sample: counterparties[0]
      });
    }

    return { counterparties, pagination: data.pagination };
  } catch (error) {
    console.error('❌ Error fetching holder counterparties:', {
      address: holderAddress,
      error: error.message,
      stack: error.stack
    });
    return { counterparties: [] };
  }
}

// Utility function for rate-limited concurrent API calls
async function processBatchWithRateLimit(items, processFn, concurrency = 15) {
  console.log(`🚀 BATCHING: Starting batch processing for ${items.length} items with concurrency ${concurrency}`);

  const results = [];
  const chunks = [];

  // Split into chunks based on concurrency
  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency));
  }

  console.log(`🚀 BATCHING: Split into ${chunks.length} chunks`);

  // Process each chunk with 1 second delay between chunks
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`📡 Processing batch ${i + 1}/${chunks.length} (${chunk.length} requests)`);

    // Execute all requests in this chunk concurrently
    const chunkResults = await Promise.allSettled(
      chunk.map(item => processFn(item))
    );

    // Collect successful results
    chunkResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      } else if (result.status === 'rejected') {
        console.warn(`⚠️ Request failed:`, result.reason?.message || result.reason);
      }
    });

    // Wait 1 second before next batch (15 requests per second)
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// Find interactions between holders with batched concurrent requests
export async function findHolderInteractions(holders, chain, timeframe = '1Y', onProgress = null) {
  console.log(`🔍 Finding interactions between ${holders.length} holders over ${timeframe}`);

  const holderAddresses = new Set(holders.map(h => h.address.toLowerCase()));
  const allInteractions = [];

  // Process ALL holders (not just a sample) with 15 concurrent requests/sec
  const processHolder = async (holder) => {
    try {
      const counterparties = await fetchHolderCounterparties(holder.address, chain, timeframe);
      const holderInteractions = [];

      if (counterparties.counterparties && counterparties.counterparties.length > 0) {
        console.log(`🔎 Holder ${holder.address.slice(0, 8)}... has ${counterparties.counterparties.length} counterparties`);

        // Check if any counterparties are also holders
        counterparties.counterparties.forEach(cp => {
          const cpAddress = (cp.interactingAddress || cp.address || '').toLowerCase();

          if (holderAddresses.has(cpAddress)) {
            console.log(`   ✅ MATCH: ${cpAddress.slice(0, 8)}... is also a holder!`);
            holderInteractions.push({
              source: holder.address.toLowerCase(),
              target: cpAddress,
              volumeIn: parseFloat(cp.volIn || 0),
              volumeOut: parseFloat(cp.volOut || 0),
              totalVolume: Math.abs(parseFloat(cp.volIn || 0)) + Math.abs(parseFloat(cp.volOut || 0))
            });
          }
        });

        if (holderInteractions.length > 0) {
          console.log(`   📊 Found ${holderInteractions.length} interactions with other holders`);
        } else {
          console.log(`   ⚠️ No counterparties matched with other holders`);
        }
      } else {
        console.log(`🔎 Holder ${holder.address.slice(0, 8)}... has NO counterparties`);
      }

      // Call progress callback if provided
      if (onProgress) {
        onProgress(holderInteractions);
      }

      return holderInteractions;
    } catch (error) {
      console.error(`❌ Error fetching counterparties for ${holder.address}:`, error.message);
      if (onProgress) {
        onProgress([]);
      }
      return [];
    }
  };

  // Process all holders with rate limiting (15 concurrent requests per second)
  const results = await processBatchWithRateLimit(holders, processHolder, 15);

  // Flatten all interactions
  results.forEach(holderInteractions => {
    allInteractions.push(...holderInteractions);
  });

  console.log(`✅ Found ${allInteractions.length} holder-to-holder interactions from ${holders.length} holders`);
  return allInteractions;
}
