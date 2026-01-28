import { useState, useCallback } from 'react';
import { fetchTokenHolders, findHolderInteractions } from '../services/nansenApi';
import { FILTERS } from '../utils/constants.js';

export const useVisualizationData = () => {
  // Core data state
  const [data, setData] = useState([]);
  const [tokenAddress, setTokenAddress] = useState('');
  const [chain, setChain] = useState('solana');

  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });

  // Filter states
  const [sizeMetric, setSizeMetric] = useState('tokenAmount');
  const [showSmartContracts, setShowSmartContracts] = useState(true);
  const [showExchanges, setShowExchanges] = useState(true);
  const [rangeMin, setRangeMin] = useState(FILTERS.DEFAULT_RANGE_MIN);
  const [rangeMax, setRangeMax] = useState(FILTERS.DEFAULT_RANGE_MAX);
  const [highlightShared, setHighlightShared] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [labelMode, setLabelMode] = useState('address');

  // Node state management
  const [customLabels, setCustomLabels] = useState(new Map());
  const [customHighlights, setCustomHighlights] = useState(new Map());
  const [deletedNodes, setDeletedNodes] = useState(new Set());
  const [deletedNodesData, setDeletedNodesData] = useState(new Map());
  const [lockedNodes, setLockedNodes] = useState(new Set());

  // Clear error when user starts typing
  const handleTokenAddressChange = useCallback((address) => {
    setTokenAddress(address);
    if (error) setError(null);
  }, [error]);

  // Fetch token holders data
  const handleApiDataFetch = useCallback(async (address = null, selectedChain = null) => {
    const addressToFetch = address || tokenAddress;
    const chainToUse = selectedChain || chain;

    if (!addressToFetch) {
      setError('Please enter a token address');
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingProgress({ current: 0, total: 0 });

    try {
      const holdersData = await fetchTokenHolders(addressToFetch, chainToUse, 100);

      if (holdersData.error) {
        throw new Error(holdersData.error);
      }

      if (!holdersData.data || holdersData.data.length === 0) {
        setError('No holder data found for this token');
        return;
      }

      // Show holders immediately (replace any existing data - single token mode)
      const transformedData = {
        tokenAddress: addressToFetch,
        chain: chainToUse,
        holders: holdersData.data,
        interactions: []
      };

      setData([transformedData]); // Replace, don't append

      // Start fetching interactions in the background
      console.log('🔗 Fetching holder interactions (last 1 year) with 15 concurrent requests/sec...');
      setLoadingProgress({ current: 0, total: holdersData.data.length });

      let processedCount = 0;
      const onProgress = (newInteractions) => {
        processedCount++;
        setLoadingProgress({ current: processedCount, total: holdersData.data.length });

        // Update interactions incrementally
        if (newInteractions.length > 0) {
          setData(prevData => {
            return prevData.map(dataset => {
              if (dataset.tokenAddress === addressToFetch) {
                return {
                  ...dataset,
                  interactions: [...dataset.interactions, ...newInteractions]
                };
              }
              return dataset;
            });
          });
        }
      };

      await findHolderInteractions(holdersData.data, chainToUse, '1Y', onProgress);

      console.log('✅ All holder interactions loaded');
      setLoadingProgress({ current: 0, total: 0 });

      // Only clear the input field if we're using the input field value
      if (!address) {
        setTokenAddress('');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, chain]);

  // Auto-scale calculation when data or size metric changes
  const updateAutoScaleFactor = useCallback(() => {
    if (data.length > 0 && sizeMetric !== 'uniform') {
      // Calculate scale factor based on the maximum value in the dataset
      let maxValue = 0;
      data.forEach(dataset => {
        dataset.holders.forEach(holder => {
          let value = 0;
          switch (sizeMetric) {
            case 'tokenAmount':
              value = holder.token_amount || 0;
              break;
            case 'valueUsd':
              value = holder.value_usd || 0;
              break;
            case 'ownershipPercentage':
              value = holder.ownership_percentage || 0;
              break;
            default:
              value = holder.token_amount || 0;
          }
          maxValue = Math.max(maxValue, value);
        });
      });

      // Auto-scale based on max value
      if (maxValue > 10000000) {
        setScaleFactor(0.1);
      } else if (maxValue > 1000000) {
        setScaleFactor(0.3);
      } else if (maxValue > 100000) {
        setScaleFactor(0.5);
      } else {
        setScaleFactor(1.0);
      }
    }
  }, [data, sizeMetric]);

  // Reset scale factor when switching to uniform
  const handleSizeMetricChange = useCallback((newSizeMetric) => {
    setSizeMetric(newSizeMetric);
    if (newSizeMetric === 'uniform') {
      setScaleFactor(1);
    }
  }, []);

  // Process data with current filters to get nodes and links
  const getProcessedData = useCallback(() => {
    const nodes = [];
    const links = [];
    const addressMap = new Map();

    // Process each token's holders (no token node - just holders)
    data.forEach((dataset) => {
      // Add holder nodes
      dataset.holders.forEach((holder) => {
        // Skip deleted nodes (use lowercase for consistency)
        if (deletedNodes.has(holder.address.toLowerCase())) {
          return;
        }

        const tokenAmount = holder.token_amount || 0;
        const valueUsd = holder.value_usd || 0;
        const ownershipPercentage = holder.ownership_percentage || 0;

        // Skip if token amount is zero
        if (tokenAmount === 0) {
          return;
        }

        // Filter smart contracts and exchanges
        const isSmartContractNode = holder.address_label?.includes('Contract');
        const isExchangeNode = holder.address_label &&
          (holder.address_label.toLowerCase().includes('exchange') ||
           holder.address_label.includes('🏦'));

        if ((!showSmartContracts && isSmartContractNode) ||
            (!showExchanges && isExchangeNode)) {
          return;
        }

        // Range filtering
        let metricValue = 0;
        if (sizeMetric !== 'uniform') {
          switch (sizeMetric) {
            case 'tokenAmount':
              metricValue = tokenAmount;
              break;
            case 'valueUsd':
              metricValue = valueUsd;
              break;
            case 'ownershipPercentage':
              metricValue = ownershipPercentage;
              break;
            default:
              metricValue = tokenAmount;
          }

          // Apply range filtering
          if ((rangeMin !== '' && metricValue < parseFloat(rangeMin)) ||
              (rangeMax !== '' && metricValue > parseFloat(rangeMax))) {
            return;
          }
        }

        // Check if holder is already in the map (use lowercase for consistency)
        const holderAddressKey = holder.address.toLowerCase();
        let holderNode = addressMap.get(holderAddressKey);
        if (!holderNode) {
          holderNode = {
            id: holderAddressKey,
            address: holder.address,
            label: customLabels.get(holder.address) ||
                   holder.address_label ||
                   `${holder.address.slice(0, 6)}...${holder.address.slice(-4)}`,
            isMain: false,
            type: 'holder',
            tokenAmount: tokenAmount,
            valueUsd: valueUsd,
            ownershipPercentage: ownershipPercentage,
            totalInflow: holder.total_inflow || 0,
            totalOutflow: holder.total_outflow || 0,
            balanceChange24h: holder.balance_change_24h || 0,
            balanceChange7d: holder.balance_change_7d || 0,
            balanceChange30d: holder.balance_change_30d || 0,
            addressLabel: holder.address_label,
            isSmartContract: isSmartContractNode,
            isExchange: isExchangeNode,
            connectedTokens: new Set([dataset.tokenAddress])
          };
          nodes.push(holderNode);
          addressMap.set(holderAddressKey, holderNode);
        } else {
          // Holder is connected to multiple tokens - mark for highlighting
          holderNode.connectedTokens.add(dataset.tokenAddress);
        }
      });

      // Add links from interactions
      if (dataset.interactions && dataset.interactions.length > 0) {
        console.log(`🔗 Processing ${dataset.interactions.length} interactions for token ${dataset.tokenAddress}`);

        let addedLinks = 0;
        let skippedLinks = 0;

        dataset.interactions.forEach(interaction => {
          // Normalize addresses to lowercase for comparison
          const sourceAddr = interaction.source.toLowerCase();
          const targetAddr = interaction.target.toLowerCase();

          // Check both nodes exist and aren't deleted
          const sourceExists = addressMap.has(sourceAddr);
          const targetExists = addressMap.has(targetAddr);
          const sourceDeleted = deletedNodes.has(sourceAddr);
          const targetDeleted = deletedNodes.has(targetAddr);

          if (sourceExists && targetExists && !sourceDeleted && !targetDeleted) {
            links.push({
              source: sourceAddr,
              target: targetAddr,
              value: interaction.totalVolume || 0,
              volumeIn: interaction.volumeIn || 0,
              volumeOut: interaction.volumeOut || 0
            });
            addedLinks++;
          } else {
            skippedLinks++;
          }
        });

        console.log(`✅ Added ${addedLinks} links, skipped ${skippedLinks} (nodes not found or deleted)`);
      } else {
        console.log(`⚠️ No interactions found for token ${dataset.tokenAddress}`);
      }
    });

    return { nodes, links, addressMap };
  }, [data, showSmartContracts, showExchanges, sizeMetric, rangeMin, rangeMax, deletedNodes, customLabels]);

  // Node management functions
  const deleteNode = useCallback((nodeId, isMainNode = false) => {
    if (isMainNode) {
      const { nodes } = getProcessedData();
      const nodeToDelete = nodes.find(n => n.id === nodeId);

      if (nodeToDelete) {
        setDeletedNodesData(prev => new Map(prev).set(nodeId, {
          ...nodeToDelete,
          deletedAt: new Date().toISOString()
        }));
      }

      // Remove the token's data from the data array
      setData(prevData => prevData.filter(d => d.tokenAddress !== nodeId));
    } else {
      const { nodes } = getProcessedData();
      const nodeToDelete = nodes.find(n => n.id === nodeId);

      if (nodeToDelete) {
        setDeletedNodesData(prev => new Map(prev).set(nodeId, {
          ...nodeToDelete,
          deletedAt: new Date().toISOString()
        }));
      }

      setDeletedNodes(prev => new Set(prev).add(nodeId));
    }
  }, [getProcessedData]);

  const restoreNode = useCallback((nodeId) => {
    const nodeData = deletedNodesData.get(nodeId);

    if (nodeData && nodeData.isMain) {
      console.log('Cannot fully restore token node - please re-add the token address');
    } else {
      setDeletedNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }

    setDeletedNodesData(prev => {
      const newMap = new Map(prev);
      newMap.delete(nodeId);
      return newMap;
    });
  }, [deletedNodesData]);

  const removeDeletedNodePermanently = useCallback((nodeId) => {
    setDeletedNodesData(prev => {
      const newMap = new Map(prev);
      newMap.delete(nodeId);
      return newMap;
    });
  }, []);

  const restoreAllNodes = useCallback(() => {
    setDeletedNodes(new Set());
    setDeletedNodesData(new Map());
  }, []);

  const removeAllDeletedNodesPermanently = useCallback(() => {
    setDeletedNodesData(new Map());
  }, []);

  const setCustomLabel = useCallback((nodeId, label) => {
    setCustomLabels(prev => new Map(prev).set(nodeId, label));
  }, []);

  const setCustomHighlight = useCallback((nodeId, color) => {
    if (color) {
      setCustomHighlights(prev => new Map(prev).set(nodeId, color));
    } else {
      setCustomHighlights(prev => {
        const newMap = new Map(prev);
        newMap.delete(nodeId);
        return newMap;
      });
    }
  }, []);

  const toggleNodeLock = useCallback((nodeId, isLocked) => {
    if (isLocked) {
      setLockedNodes(prev => new Set(prev).add(nodeId));
    } else {
      setLockedNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }
  }, []);

  return {
    // Data state
    data,
    tokenAddress,
    chain,

    // Loading states
    loading,
    error,
    loadingProgress,

    // Filter states
    sizeMetric,
    showSmartContracts,
    showExchanges,
    rangeMin,
    rangeMax,
    highlightShared,
    scaleFactor,
    labelMode,

    // Node states
    customLabels,
    customHighlights,
    deletedNodes,
    deletedNodesData,
    lockedNodes,

    // Data processing
    getProcessedData,

    // Data management actions
    setTokenAddress: handleTokenAddressChange,
    setChain,
    handleApiDataFetch,
    handleSizeMetricChange,

    // Filter actions
    setSizeMetric: handleSizeMetricChange,
    setShowSmartContracts,
    setShowExchanges,
    setRangeMin,
    setRangeMax,
    setHighlightShared,
    setScaleFactor,
    setLabelMode,

    // Node management actions
    deleteNode,
    restoreNode,
    removeDeletedNodePermanently,
    restoreAllNodes,
    removeAllDeletedNodesPermanently,
    setCustomLabel,
    setCustomHighlight,
    toggleNodeLock,

    // Utility actions
    updateAutoScaleFactor
  };
};
