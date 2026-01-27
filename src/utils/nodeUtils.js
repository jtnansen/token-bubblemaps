import { FILTERS, UI, POSITIONING, COLORS } from './constants.js';
import { calculateRadius } from './calculations.js';

/**
 * Check if a label indicates a smart contract
 */
export const isSmartContract = (label) => {
  return label && label.includes(FILTERS.SMART_CONTRACT_EMOJI);
};

/**
 * Check if a label indicates an exchange
 */
export const isExchange = (label) => {
  return label && label.includes(FILTERS.EXCHANGE_EMOJI);
};

/**
 * Clean Nansen labels by removing address brackets
 */
export const cleanNansenLabel = (label) => {
  if (!label) return label;
  
  // Check if the entire label is just an address in brackets (like [0x123456])
  const addressOnlyPattern = /^\s*\[([^\]]+)\]\s*$/;
  const addressOnlyMatch = label.match(addressOnlyPattern);
  
  if (addressOnlyMatch) {
    // If it's just an address in brackets, return the address without brackets
    return addressOnlyMatch[1].trim();
  }
  
  // Otherwise, remove square brackets and everything inside them
  return label.replace(/\s*\[.*?\]\s*/g, '').trim();
};

/**
 * Truncate text to fit within a bubble radius
 */
export const truncateTextForBubble = (text, radius) => {
  // Use more aggressive sizing to get closer to the border
  // Estimate characters that fit within the bubble diameter with smaller font
  const maxChars = Math.floor((radius * UI.TEXT_TRUNCATION_RATIO) / 4);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 2) + '..';
};

/**
 * Get display text for a node based on label mode and custom settings
 */
export const getNodeDisplayText = (node, labelMode, customLabels, sizeMetric, scaleFactor) => {
  const customLabel = customLabels.get(node.id);
  let displayText;
  
  if (customLabel) {
    displayText = customLabel;
  } else if (labelMode === 'address') {
    // Always use exactly 6 characters for address preview
    displayText = `${node.address.slice(0, 6)}${node.isSmartContract ? ` ${FILTERS.SMART_CONTRACT_EMOJI}` : ''}${node.isExchange ? ` ${FILTERS.EXCHANGE_EMOJI}` : ''}`;
  } else {
    const cleanLabel = cleanNansenLabel(node.label || node.address.slice(0, 6));
    displayText = `${cleanLabel}${node.isSmartContract ? ` ${FILTERS.SMART_CONTRACT_EMOJI}` : ''}${node.isExchange ? ` ${FILTERS.EXCHANGE_EMOJI}` : ''}`;
  }
  
  // Truncate text to fit within bubble
  const radius = calculateRadius(node, sizeMetric, scaleFactor);
  return truncateTextForBubble(displayText, radius);
};

/**
 * Calculate font size for node text based on radius
 */
export const calculateFontSize = (node, sizeMetric, scaleFactor) => {
  const radius = calculateRadius(node, sizeMetric, scaleFactor);
  return Math.min(UI.FONT_SIZE_MAX, radius * UI.FONT_SIZE_RATIO);
};

/**
 * Position new holder nodes randomly in the canvas
 */
export const positionNewCounterpartyNode = (node, mainNode, width, height) => {
  // Random positioning - all holders are equals in a cluster
  node.x = Math.random() * width;
  node.y = Math.random() * height;
};

/**
 * Get stroke color for a node based on its properties and state
 */
export const getNodeStrokeColor = (node, customHighlights, highlightShared, selectedNodeId = null) => {
  const customHighlight = customHighlights.get(node.id);
  if (customHighlight) return customHighlight;

  // Highlight selected node from dropdown
  if (selectedNodeId && node.id === selectedNodeId) {
    return COLORS.BLUE_HIGHLIGHT;
  }

  // Highlight holders connected to multiple tokens
  if (highlightShared && node.connectedTokens?.size > 1) {
    return COLORS.BLUE_HIGHLIGHT;
  }

  // All holders use green stroke
  return COLORS.GREEN_STROKE;
};

/**
 * Get fill color for a node
 */
export const getNodeFillColor = (node) => {
  // All holders use green fill
  return COLORS.GREEN_FILL;
};

/**
 * Check if a node should be filtered out based on current filter settings
 */
export const shouldFilterNode = (transaction, filters) => {
  const {
    showSmartContracts,
    showExchanges, 
    sizeMetric,
    rangeMin,
    rangeMax,
    deletedNodes
  } = filters;

  // Skip if node was previously deleted
  if (deletedNodes.has(transaction.interactingAddress)) {
    return true;
  }

  const usdNetflow = parseFloat(transaction.usdNetflow);
  const volIn = parseFloat(transaction.volIn);
  const volOut = parseFloat(transaction.volOut);

  // Skip if all values are zero
  if (usdNetflow === 0 && volIn === 0 && volOut === 0) {
    return true;
  }

  // Universal filter: Skip if Total Volume is less than $1
  const totalVolume = Math.abs(volIn) + Math.abs(volOut);
  if (totalVolume < FILTERS.MIN_TOTAL_VOLUME) {
    return true;
  }

  // Range filtering
  let metricValue;
  if (sizeMetric === 'uniform') {
    metricValue = 0; // Skip range filtering for uniform sizing
  } else if (sizeMetric === 'totalVolume') {
    metricValue = volIn + volOut;
  } else {
    metricValue = parseFloat(transaction[sizeMetric]);
  }
  
  // Only apply range filtering if not using uniform sizing
  if (sizeMetric !== 'uniform' && 
      ((rangeMin !== '' && metricValue < parseFloat(rangeMin)) ||
       (rangeMax !== '' && metricValue > parseFloat(rangeMax)))) {
    return true;
  }

  // Filter smart contracts and exchanges
  if ((!showSmartContracts && isSmartContract(transaction.interactingLabel)) ||
      (!showExchanges && isExchange(transaction.interactingLabel))) {
    return true;
  }

  return false;
};

/**
 * Generate tooltip content for a node
 */
export const generateNodeTooltip = (node, customLabels, formatNumber) => {
  const label = node.label || 'N/A';
  const tokenAmount = node.tokenAmount ? node.tokenAmount.toLocaleString() : 'N/A';
  const valueUsd = node.valueUsd ? formatNumber(node.valueUsd) : 'N/A';
  const ownership = node.ownershipPercentage ? node.ownershipPercentage.toFixed(2) + '%' : 'N/A';
  const mainInfo = `Token Amount: ${tokenAmount}<br>Value USD: ${valueUsd}<br>Ownership: ${ownership}${node.addressLabel ? '<br>Label: ' + node.addressLabel : ''}${node.isSmartContract ? '<br>Smart Contract' : ''}${node.isExchange ? '<br>Exchange' : ''}<br>Connected to ${node.connectedTokens?.size || 1} token(s)`;
  return `<strong>${label}</strong><br><br>${mainInfo}<br><br>${node.address}`;
};

/**
 * Transform raw API data into internal node format
 */
export const transformApiTransaction = (cp, mainAddress) => ({
  interactingAddress: cp.interactingAddress || cp.address || cp.wallet_address || cp.counterparty_address,
  volIn: cp.volIn || cp.volumeIn || cp.volume_in || cp.inflow || '0',
  volOut: cp.volOut || cp.volumeOut || cp.volume_out || cp.outflow || '0',
  usdNetflow: cp.usdNetflow || cp.netFlow || cp.net_flow || cp.usd_netflow || '0',
  label: cp.interactingLabel || cp.name || cp.symbol || cp.label || '',
  interactingLabel: cp.interactingLabel || cp.name || cp.symbol || cp.label || '',
  chain: cp.chain || (mainAddress.startsWith('0x') ? 'ethereum' : 'solana'),
});

/**
 * Create a new node object from transaction data
 */
export const createNodeFromTransaction = (transaction, mainAddress, customLabels) => ({
  id: transaction.interactingAddress,
  address: transaction.interactingAddress,
  label: customLabels.get(transaction.interactingAddress) || transaction.interactingLabel,
  usdNetflow: parseFloat(transaction.usdNetflow),
  volIn: parseFloat(transaction.volIn),
  volOut: parseFloat(transaction.volOut),
  chain: transaction.chain,
  isMain: false,
  isSmartContract: isSmartContract(transaction.interactingLabel),
  isExchange: isExchange(transaction.interactingLabel),
  connectedMainAddresses: new Set([mainAddress])
}); 