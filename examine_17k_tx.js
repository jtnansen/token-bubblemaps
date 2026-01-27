// Examine the $17.1k transaction in detail
import fetch from 'node-fetch';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf-8');
const apiKey = envContent.split('\n')
  .find(line => line.startsWith('VITE_NANSEN_API_KEY='))
  ?.split('=')[1]
  ?.trim();

const mainAddress = '7Z5VhcNSpMpaTVqRg8QTkySw6syfcTehTx8CqRPvf9bg';
const counterpartyAddress = '6ruqEocByFM5wUtc2kbA2j2ctG78RtunHmedKjjSrNDw';
const txHash = '66JqUi2GCQabw7jr6vfB35HeMSLEJT2ZMzKWMHWgHFBB9AVTuKR1BC4S4k3rk99M3DuYAJvVghkPKh7MuitqTgZP';

console.log('🔍 Fetching specific transaction details');
console.log('Hash:', txHash);

async function examineTransaction() {
  try {
    // Use same date range as frontend (1Y)
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 365);

    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const fromDate = `${formatDate(startDate)}T00:00:00Z`;
    const toDate = `${formatDate(today)}T23:59:59Z`;

    // Fetch transactions with counterparty filter
    const response = await fetch('https://api.nansen.ai/api/v1/profiler/address/transactions', {
      method: 'POST',
      headers: {
        'apiKey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: mainAddress,
        chain: "solana",
        date: {
          from: fromDate,
          to: toDate
        },
        pagination: {
          page: 1,
          per_page: 100
        },
        filters: {
          counterparty_address: counterpartyAddress,
          volume_usd: {
            min: 0.1
          }
        }
      })
    });

    const data = await response.json();
    const tx = data.data?.find(t => t.transaction_hash === txHash);

    if (!tx) {
      console.log('❌ Transaction not found in recent activity');
      return;
    }

    console.log('\n✅ FOUND TRANSACTION');
    console.log('Volume USD:', tx.volume_usd);
    console.log('Method:', tx.method);
    console.log('Timestamp:', tx.block_timestamp);

    console.log('\n💸 TOKENS SENT (' + tx.tokens_sent.length + ' total):');
    tx.tokens_sent.forEach((token, i) => {
      const fromIsMain = token.from_address === mainAddress;
      const toIsMain = token.to_address === mainAddress;
      const fromIsCounterparty = token.from_address === counterpartyAddress;
      const toIsCounterparty = token.to_address === counterpartyAddress;
      const isDirectFlow = (fromIsMain && toIsCounterparty) || (fromIsCounterparty && toIsMain);

      console.log(`\n  [${i + 1}] ${token.token_symbol} ${isDirectFlow ? '✅ DIRECT FLOW' : '⚠️  INDIRECT'}`);
      console.log('      Amount:', token.token_amount);
      console.log('      Value USD:', token.value_usd);
      console.log('      From:', token.from_address);
      console.log('           ', token.from_address_label || '(no label)');
      console.log('      To:  ', token.to_address);
      console.log('           ', token.to_address_label || '(no label)');

      if (fromIsMain) console.log('      → From is MAIN');
      if (toIsMain) console.log('      → To is MAIN');
      if (fromIsCounterparty) console.log('      → From is COUNTERPARTY');
      if (toIsCounterparty) console.log('      → To is COUNTERPARTY');
    });

    console.log('\n💰 TOKENS RECEIVED (' + tx.tokens_received.length + ' total):');
    tx.tokens_received.forEach((token, i) => {
      const fromIsMain = token.from_address === mainAddress;
      const toIsMain = token.to_address === mainAddress;
      const fromIsCounterparty = token.from_address === counterpartyAddress;
      const toIsCounterparty = token.to_address === counterpartyAddress;
      const isDirectFlow = (fromIsMain && toIsCounterparty) || (fromIsCounterparty && toIsMain);

      console.log(`\n  [${i + 1}] ${token.token_symbol} ${isDirectFlow ? '✅ DIRECT FLOW' : '⚠️  INDIRECT'}`);
      console.log('      Amount:', token.token_amount);
      console.log('      Value USD:', token.value_usd);
      console.log('      From:', token.from_address);
      console.log('           ', token.from_address_label || '(no label)');
      console.log('      To:  ', token.to_address);
      console.log('           ', token.to_address_label || '(no label)');

      if (fromIsMain) console.log('      → From is MAIN');
      if (toIsMain) console.log('      → To is MAIN');
      if (fromIsCounterparty) console.log('      → From is COUNTERPARTY');
      if (toIsCounterparty) console.log('      → To is COUNTERPARTY');
    });

    // Check if there's any direct flow
    const hasDirectFlowInSent = tx.tokens_sent.some(token =>
      (token.from_address === mainAddress && token.to_address === counterpartyAddress) ||
      (token.from_address === counterpartyAddress && token.to_address === mainAddress)
    );

    const hasDirectFlowInReceived = tx.tokens_received.some(token =>
      (token.from_address === mainAddress && token.to_address === counterpartyAddress) ||
      (token.from_address === counterpartyAddress && token.to_address === mainAddress)
    );

    console.log('\n\n📊 ANALYSIS:');
    console.log('Has direct flow in tokens_sent?', hasDirectFlowInSent ? '✅ YES' : '❌ NO');
    console.log('Has direct flow in tokens_received?', hasDirectFlowInReceived ? '✅ YES' : '❌ NO');

    if (!hasDirectFlowInSent && !hasDirectFlowInReceived) {
      console.log('\n⚠️  CONCLUSION: This transaction should NOT be shown when filtering by counterparty_address');
      console.log('It involves both addresses but through INTERMEDIATE hops (like a DEX swap).');
      console.log('The Nansen API counterparty_address filter may be including indirect relationships.');
    } else {
      console.log('\n✅ CONCLUSION: This transaction HAS a direct flow and should be included.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

examineTransaction();
