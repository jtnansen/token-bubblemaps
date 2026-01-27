// Simplified hook for token holder visualization
// No link expansion needed for token-to-holder relationships
export const useExpandedLinks = (timeframe) => {
  return {
    // State
    expandedLinks: new Map(),
    loadingTransactions: new Set(),

    // Actions - all no-ops
    toggleLinkExpansion: () => Promise.resolve({ expanded: false }),
    processLinksWithExpansions: (links) => links,
    clearExpandedLinks: () => {},

    // Queries
    isLinkLoading: () => false,
    isLinkExpanded: () => false,
    getLinkTransactions: () => []
  };
};
