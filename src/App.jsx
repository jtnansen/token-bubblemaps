import React, { useEffect, useState } from 'react';
import { useVisualizationData } from './hooks/useVisualizationData.js';
import D3Visualization from './components/Visualization/D3Visualization.jsx';
import TopNavbar from './components/Layout/TopNavbar.jsx';
import WelcomeScreen from './components/Layout/WelcomeScreen.jsx';
import DeletedNodesWidget from './components/Layout/DeletedNodesWidget.jsx';
import HoldersSidebar from './components/Layout/HoldersSidebar.jsx';
import { COLORS, UI } from './utils/constants.js';

const App = () => {
  // Store the zoomToNode function from D3Visualization
  const [zoomToNodeFn, setZoomToNodeFn] = useState(null);
  // Track selected node from dropdown for highlighting
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  // Use the custom hooks for data management
  const {
    // Data state
    data,
    tokenAddress,
    chain,
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

    // Actions
    setTokenAddress,
    setChain,
    handleApiDataFetch,
    setSizeMetric,
    setShowSmartContracts,
    setShowExchanges,
    setRangeMin,
    setRangeMax,
    setHighlightShared,
    setScaleFactor,
    setLabelMode,
    restoreNode,
    removeDeletedNodePermanently,
    restoreAllNodes,
    removeAllDeletedNodesPermanently,
    deleteNode,
    setCustomLabel,
    setCustomHighlight,
    toggleNodeLock,

    // Data processing
    updateAutoScaleFactor,
    getProcessedData
  } = useVisualizationData();

  // Auto-scale calculation when data changes
  useEffect(() => {
    updateAutoScaleFactor();
  }, [data, sizeMetric, updateAutoScaleFactor]);

  // Handle loading sample address from welcome screen
  const handleLoadSample = (address) => {
    setTokenAddress(address);
    handleApiDataFetch(address);
  };

  // Debug logging for data changes
  useEffect(() => {
    console.log('📊 App: Data changed:', {
      tokenCount: data.length,
      tokens: data.map(d => ({ address: d.tokenAddress, holderCount: d.holders.length }))
    });
  }, [data]);

  // Debug logging for processed data
  useEffect(() => {
    if (data.length > 0) {
      try {
        const processed = getProcessedData();
        console.log('🔧 App: Processed data:', {
          nodeCount: processed.nodes.length,
          linkCount: processed.links.length,
          tokenNodes: processed.nodes.filter(n => n.isMain).length,
          holderNodes: processed.nodes.filter(n => !n.isMain).length
        });
      } catch (error) {
        console.error('❌ App: Error processing data:', error);
      }
    }
  }, [data, getProcessedData]);

  return (
    <div className="App">
      {/* Top Navbar */}
      <TopNavbar
        data={data}
        tokenAddress={tokenAddress}
        chain={chain}
        loading={loading}
        sizeMetric={sizeMetric}
        showSmartContracts={showSmartContracts}
        showExchanges={showExchanges}
        rangeMin={rangeMin}
        rangeMax={rangeMax}
        highlightShared={highlightShared}
        scaleFactor={scaleFactor}
        labelMode={labelMode}
        setTokenAddress={setTokenAddress}
        setChain={setChain}
        handleApiDataFetch={handleApiDataFetch}
        setSizeMetric={setSizeMetric}
        setShowSmartContracts={setShowSmartContracts}
        setShowExchanges={setShowExchanges}
        setRangeMin={setRangeMin}
        setRangeMax={setRangeMax}
        setHighlightShared={setHighlightShared}
        setScaleFactor={setScaleFactor}
        setLabelMode={setLabelMode}
        zoomToNode={zoomToNodeFn}
        onDeleteToken={deleteNode}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
      />

      {/* Error Display */}
      {error && (
        <div style={{
          position: 'fixed',
          top: '70px',
          left: '15px',
          right: '15px',
          color: '#FF7F7B',
          fontSize: '12px',
          padding: '8px',
          background: COLORS.UI_BACKGROUND,
          borderRadius: '4px',
          zIndex: UI.CONTEXT_MENU_Z_INDEX - 1
        }}>
          {error}
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ marginTop: '70px', width: '100%', height: 'calc(100vh - 70px)' }}>
        {data.length === 0 ? (
          <WelcomeScreen onLoadSample={handleLoadSample} />
        ) : (
          <>
            <div style={{ marginRight: '320px', width: 'calc(100% - 320px)', height: '100%' }}>
              <D3Visualization
                data={data}
                sizeMetric={sizeMetric}
                scaleFactor={scaleFactor}
                labelMode={labelMode}
                customLabels={customLabels}
                customHighlights={customHighlights}
                highlightShared={highlightShared}
                lockedNodes={lockedNodes}
                deletedNodes={deletedNodes}
                selectedNodeId={selectedNodeId}
                onDeleteNode={deleteNode}
                onSetCustomLabel={setCustomLabel}
                onSetCustomHighlight={setCustomHighlight}
                onToggleNodeLock={toggleNodeLock}
                onAddToken={handleApiDataFetch}
                getProcessedData={getProcessedData}
                onZoomToNode={setZoomToNodeFn}
              />
            </div>
            <HoldersSidebar data={data} loading={loading} loadingProgress={loadingProgress} />
          </>
        )}
      </div>

      {/* Deleted Nodes Widget */}
      <DeletedNodesWidget
        deletedNodesData={deletedNodesData}
        restoreAllNodes={restoreAllNodes}
        removeAllDeletedNodesPermanently={removeAllDeletedNodesPermanently}
        restoreNode={restoreNode}
        removeDeletedNodePermanently={removeDeletedNodePermanently}
      />
    </div>
  );
};

export default App;
