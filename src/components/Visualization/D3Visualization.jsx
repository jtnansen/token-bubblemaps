import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useExpandedLinks } from '../../hooks/useExpandedLinks.js';
import ContextMenu from './ContextMenu.jsx';
import { COLORS, PHYSICS, UI, SIZES, ANIMATION } from '../../utils/constants.js';
import { calculateRadius, calculateCollisionRadius, formatNumber } from '../../utils/calculations.js';
import { 
  getNodeDisplayText, 
  calculateFontSize, 
  positionNewCounterpartyNode,
  getNodeStrokeColor,
  getNodeFillColor,
  generateNodeTooltip
} from '../../utils/nodeUtils.js';

const D3Visualization = ({
  data,
  sizeMetric,
  scaleFactor,
  labelMode,
  customLabels,
  customHighlights,
  highlightShared,
  lockedNodes,
  deletedNodes,
  selectedNodeId,
  onDeleteNode,
  onSetCustomLabel,
  onSetCustomHighlight,
  onToggleNodeLock,
  onAddToken,
  getProcessedData,
  onZoomToNode
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const currentTransformRef = useRef(d3.zoomIdentity);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const zoomRef = useRef(null);

  // Context menu handlers
  const handleCopyAddress = useCallback((address) => {
    navigator.clipboard.writeText(address).then(() => {
      console.log('Address copied to clipboard:', address);
    }).catch(err => {
      console.error('Failed to copy address:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = address;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
  }, []);

  // Fullscreen toggle (pseudo-fullscreen that keeps navbar visible)
  const toggleFullscreen = useCallback(() => {
    console.log('🔲 Fullscreen button clicked!');
    setIsFullscreen(prev => {
      const newValue = !prev;
      console.log('🔲 Toggling fullscreen from', prev, 'to', newValue);
      return newValue;
    });
  }, []);

  // Listen for ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Function to zoom and center on a specific node
  const zoomToNode = useCallback((address) => {
    if (!zoomRef.current) {
      console.warn('⚠️ Zoom not initialized yet');
      return;
    }

    const { svg, zoom, nodes, width, height } = zoomRef.current;
    const node = nodes.find(n => n.id === address);

    if (!node) {
      console.warn('⚠️ Node not found:', address);
      return;
    }

    console.log('🎯 Zooming to node:', { address, x: node.x, y: node.y });

    // Calculate transform to center the node
    const scale = 1.5; // Zoom level
    const x = width / 2 - node.x * scale;
    const y = height / 2 - node.y * scale;

    // Apply the transform with animation
    svg.transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  }, []);

  // Expose zoomToNode via prop callback
  useEffect(() => {
    if (onZoomToNode) {
      onZoomToNode(zoomToNode);
    }
  }, [onZoomToNode, zoomToNode]);

  const createVisualization = useCallback(() => {
    if (!data.length || !svgRef.current) return;

    try {
      const { nodes, links, addressMap } = getProcessedData();
      
      console.log(`📊 Processing ${nodes.length} nodes and ${links.length} links`);
      
      if (nodes.length === 0) {
        console.warn('No nodes to display after filtering');
        return;
      }

      const finalLinks = links;

      // Set up SVG
      const svg = d3.select(svgRef.current);
      const width = window.innerWidth - UI.CONTROLS_WIDTH;
      const height = window.innerHeight;

      console.log(`🚀 CREATE VISUALIZATION - Start`);
      console.log(`📊 Processing ${nodes.length} nodes and ${links.length} original links`);
      console.log(`🔗 Final links after expansion processing: ${finalLinks.length}`);
      
      // Count transaction links at start
      const initialTransactionLinks = finalLinks.filter(link => link.isTransactionLink);
      const initialAggregatedLinks = finalLinks.filter(link => !link.isTransactionLink);
      console.log(`📈 INITIAL: Transaction links: ${initialTransactionLinks.length}, Aggregated links: ${initialAggregatedLinks.length}`);
      
      if (initialTransactionLinks.length > 0) {
        console.log(`🔗 Found ${initialTransactionLinks.length} transaction links to render`);
      }

      // Store current transform before clearing
      const oldTransform = currentTransformRef.current;

      // Store existing node positions before rebuilding
      const oldNodes = new Map();
      svg.selectAll('.bubble').each(function(d) {
        if (d) {
          oldNodes.set(d.id, {
            x: d.x,
            y: d.y,
            fx: d.fx,
            fy: d.fy
          });
        }
      });

      svg.selectAll("*").remove();
      svg.attr('width', width).attr('height', height);

      // Position nodes with better initialization
      nodes.forEach(node => {
        const oldPos = oldNodes.get(node.id);
        if (oldPos) {
          node.x = oldPos.x;
          node.y = oldPos.y;
          // Restore fixed positions for locked nodes
          if (lockedNodes.has(node.id)) {
            node.fx = oldPos.fx;
            node.fy = oldPos.fy;
          }
        } else {
          // Position new holders randomly
          positionNewCounterpartyNode(node, null, width, height);
        }
      });

      // Create physics simulation - simple clustering for holders
      const simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id)
          .distance(150)
          .strength(0.5))
        .force('charge', d3.forceManyBody()
          .strength(-300))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05))
        .force('collision', d3.forceCollide()
          .radius(d => calculateCollisionRadius(d, sizeMetric, scaleFactor))
          .strength(0.8))
        .velocityDecay(PHYSICS.VELOCITY_DECAY);

      // Create container for zoom
      const container = svg.append('g').attr('class', 'zoom-container');

      // Set up zoom behavior
      const zoom = d3.zoom()
        .scaleExtent(UI.ZOOM_SCALE_EXTENT)
        .on('zoom', (event) => {
          const { transform } = event;
          currentTransformRef.current = transform;
          // Zoom transform applied to container only - links maintain constant width
          container.style('transform', `translate(${transform.x}px,${transform.y}px) scale(${transform.k})`);
        });

      // Store zoom behavior in ref for external access
      zoomRef.current = {
        zoom,
        svg,
        container,
        nodes,
        width,
        height
      };

      // Add arrow markers
      const defs = svg.append('defs');
      defs.append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 5)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', COLORS.WHITE)
        .attr('d', 'M0,-5L10,0L0,5');

      // Create tooltip
      const tooltip = d3.select('body')
        .selectAll('.custom-tooltip')
        .data([0])
        .join('div')
        .attr('class', 'custom-tooltip')
        .style('position', 'absolute')
        .style('background-color', COLORS.BACKGROUND)
        .style('border', `1px solid ${COLORS.UI_BACKGROUND}`)
        .style('padding', '8px')
        .style('border-radius', '4px')
        .style('color', COLORS.WHITE)
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', UI.CONTEXT_MENU_Z_INDEX)
        .style('display', 'none')
        .style('max-width', '300px')
        .style('line-height', '1.4');

      // Function to update links in place without full rebuild
      let link; // Declare link variable to be accessible in updateLinksInPlace
      
      const updateLinksInPlace = () => {
        const { nodes: currentNodes, links: currentLinks, addressMap: currentAddressMap } = getProcessedData();
        const updatedFinalLinks = currentLinks;
        
        // Count transaction links
        const transactionLinks = updatedFinalLinks.filter(link => link.isTransactionLink);
        if (transactionLinks.length > 0) {
          console.log(`🔗 Updating ${transactionLinks.length} transaction links`);
        }
        
        // Update the link data and redraw
        const linkContainer = container.select('g.links-container');
        const linkSelection = linkContainer.selectAll('path')
          .data(updatedFinalLinks, d => d.linkId || `${d.source.id || d.source}-${d.target.id || d.target}-${d.transactionIndex || 0}`);
        
        // Remove old links
        linkSelection.exit().remove();
        
        // Add new links with smooth fade-in
        const newLinks = linkSelection.enter()
          .append('path')
          .attr('class', 'link')
          .attr('fill', 'none')
          .attr('opacity', 0)
          .transition()
          .duration(500)
          .ease(d3.easeQuadOut)
          .attr('opacity', 1)
          .selection();
        
        // Update all links (new and existing)
        const allLinks = linkSelection.merge(newLinks)
          .attr('stroke', d => {
            const sourceNode = currentAddressMap.get(d.source.id || d.source);
            const targetNode = currentAddressMap.get(d.target.id || d.target);
            
            if (d.isTransactionLink) {
              const color = d.direction === 'incoming' ? COLORS.GREEN_STROKE : COLORS.RED_STROKE;
              return color;
            }
            
            return (sourceNode && targetNode && sourceNode.isMain && targetNode.isMain) 
              ? COLORS.WHITE 
              : (d.value > 0 ? COLORS.GREEN_STROKE : COLORS.RED_STROKE);
          })
          .attr('stroke-width', d => {
            const sourceNode = currentAddressMap.get(d.source.id || d.source);
            const targetNode = currentAddressMap.get(d.target.id || d.target);
            
            if (d.isTransactionLink) {
              return SIZES.LINK_WIDTH.TRANSACTION;
            }
            
            return (sourceNode && targetNode && sourceNode.isMain && targetNode.isMain) 
              ? SIZES.LINK_WIDTH.MAIN_TO_MAIN
              : SIZES.LINK_WIDTH.AGGREGATED;
          })
          .attr('marker-end', d => {
            const sourceNode = currentAddressMap.get(d.source.id || d.source);
            const targetNode = currentAddressMap.get(d.target.id || d.target);
            return (sourceNode && targetNode && sourceNode.isMain && targetNode.isMain) ? 'url(#arrow)' : '';
          })
          .style('cursor', d => {
            const sourceNode = currentAddressMap.get(d.source.id || d.source);
            const targetNode = currentAddressMap.get(d.target.id || d.target);

            if (d.isTransactionLink) {
              return 'pointer'; // Transaction links are now clickable to copy hash
            }

            return ((sourceNode?.isMain && !targetNode?.isMain) || (!sourceNode?.isMain && targetNode?.isMain)) ? 'pointer' : 'default';
          })
          .on('click', async function(event, d) {
            // If it's a transaction link, copy the hash to clipboard
            if (d.isTransactionLink) {
              if (d.transaction?.transactionHash) {
                try {
                  await navigator.clipboard.writeText(d.transaction.transactionHash);
                  console.log('✅ Transaction hash copied:', d.transaction.transactionHash);

                  // Show a brief confirmation
                  tooltip
                    .style('display', 'block')
                    .html('<strong style="color: #34CF82;">Hash copied!</strong>')
                    .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
                    .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);

                  setTimeout(() => {
                    tooltip.style('display', 'none');
                  }, 1000);
                } catch (err) {
                  console.error('❌ Failed to copy hash:', err);
                }
              }
              event.stopPropagation();
              return;
            }

            const sourceNode = currentAddressMap.get(d.source.id || d.source);
            const targetNode = currentAddressMap.get(d.target.id || d.target);

            if (!((sourceNode?.isMain && !targetNode?.isMain) || (!sourceNode?.isMain && targetNode?.isMain))) {
              return;
            }

            event.stopPropagation();
            // No link expansion for holder networks
          })
          .on('mouseenter', function(event, d) {
            if (d.isTransactionLink && d.transaction) {
              const tx = d.transaction;
              let tokenSymbol = 'Unknown';
              let tokenAmount = '';

              // Handle both Ethereum (token_symbol) and Solana (symbol) field names
              if (tx.tokensSent && tx.tokensSent.length > 0) {
                const token = tx.tokensSent[0];
                tokenSymbol = token.token_symbol || token.symbol || 'Unknown';
                const amount = token.token_amount || token.amount;
                if (amount) {
                  tokenAmount = ` (${Math.abs(Number(amount)).toLocaleString()})`;
                }
              } else if (tx.tokensReceived && tx.tokensReceived.length > 0) {
                const token = tx.tokensReceived[0];
                tokenSymbol = token.token_symbol || token.symbol || 'Unknown';
                const amount = token.token_amount || token.amount;
                if (amount) {
                  tokenAmount = ` (${Math.abs(Number(amount)).toLocaleString()})`;
                }
              }

              // Show transaction hash preview (first 10 chars)
              const hashPreview = tx.transactionHash ?
                `${tx.transactionHash.slice(0, 10)}...` :
                'No hash';

              const tooltipContent = `<strong>${formatNumber(tx.volumeUsd)}</strong><br><strong style="color: #34CF82;">${tokenSymbol}</strong>${tokenAmount}<br><small>${new Date(tx.blockTimestamp).toLocaleDateString()}</small><br><span style="color: #888; font-size: 10px;">${hashPreview}</span><br><small style="color: #34CF82;">Click to copy hash</small>`;

              tooltip
                .style('display', 'block')
                .html(tooltipContent)
                .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
                .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);
            }
          })
          .on('mouseleave', function() {
            tooltip.style('display', 'none');
          })
          .on('mousemove', function(event) {
            if (tooltip.style('display') === 'block') {
              tooltip
                .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
                .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);
            }
          });

        // Update simulation with new links
        simulation.force('link').links(updatedFinalLinks);
        simulation.alpha(0.03).restart(); // Very gentle restart for smooth incremental updates

        // Update the link reference
        link = allLinks;
      };

      // Create links with container for organized grouping
      link = container.append('g')
        .attr('class', 'links-container')
        .selectAll('path')
        .data(finalLinks)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('opacity', 0)
        .transition()
        .duration(800)
        .ease(d3.easeQuadOut)
        .attr('opacity', 1)
        .selection()
        .attr('stroke', d => {
          const sourceNode = addressMap.get(d.source.id || d.source);
          const targetNode = addressMap.get(d.target.id || d.target);
          
          if (d.isTransactionLink) {
            const color = d.direction === 'incoming' ? COLORS.GREEN_STROKE : COLORS.RED_STROKE;
            return color;
          }
          
          return (sourceNode && targetNode && sourceNode.isMain && targetNode.isMain) 
            ? COLORS.WHITE 
            : (d.value > 0 ? COLORS.GREEN_STROKE : COLORS.RED_STROKE);
        })
        .attr('stroke-width', d => {
          const sourceNode = addressMap.get(d.source.id || d.source);
          const targetNode = addressMap.get(d.target.id || d.target);
          
          if (d.isTransactionLink) {
            return SIZES.LINK_WIDTH.TRANSACTION;
          }
          
          return (sourceNode && targetNode && sourceNode.isMain && targetNode.isMain) 
            ? SIZES.LINK_WIDTH.MAIN_TO_MAIN 
            : SIZES.LINK_WIDTH.AGGREGATED;
        })
        .attr('marker-end', d => {
          const sourceNode = addressMap.get(d.source.id || d.source);
          const targetNode = addressMap.get(d.target.id || d.target);
          return (sourceNode && targetNode && sourceNode.isMain && targetNode.isMain) ? 'url(#arrow)' : '';
        })
        .attr('fill', 'none')
        .style('cursor', d => {
          const sourceNode = addressMap.get(d.source.id || d.source);
          const targetNode = addressMap.get(d.target.id || d.target);

          if (d.isTransactionLink) {
            return 'pointer'; // Transaction links are now clickable to copy hash
          }

          return ((sourceNode?.isMain && !targetNode?.isMain) || (!sourceNode?.isMain && targetNode?.isMain)) ? 'pointer' : 'default';
        })
        .on('click', async function(event, d) {
          // If it's a transaction link, copy the hash to clipboard
          if (d.isTransactionLink) {
            if (d.transaction?.transactionHash) {
              try {
                await navigator.clipboard.writeText(d.transaction.transactionHash);
                console.log('✅ Transaction hash copied:', d.transaction.transactionHash);

                // Show a brief confirmation
                tooltip
                  .style('display', 'block')
                  .html('<strong style="color: #34CF82;">Hash copied!</strong>')
                  .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
                  .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);

                setTimeout(() => {
                  tooltip.style('display', 'none');
                }, 1000);
              } catch (err) {
                console.error('❌ Failed to copy hash:', err);
              }
            }
            event.stopPropagation();
            return;
          }
          
          const sourceNode = addressMap.get(d.source.id || d.source);
          const targetNode = addressMap.get(d.target.id || d.target);

          // No link expansion for holder networks
          event.stopPropagation();
        })
        .on('mouseenter', function(event, d) {
          if (d.isTransactionLink && d.transaction) {
            const tx = d.transaction;
            let tokenSymbol = 'Unknown';
            let tokenAmount = '';

            // Handle both Ethereum (token_symbol) and Solana (symbol) field names
            if (tx.tokensSent && tx.tokensSent.length > 0) {
              const token = tx.tokensSent[0];
              tokenSymbol = token.token_symbol || token.symbol || 'Unknown';
              const amount = token.token_amount || token.amount;
              if (amount) {
                tokenAmount = ` (${Math.abs(Number(amount)).toLocaleString()})`;
              }
            } else if (tx.tokensReceived && tx.tokensReceived.length > 0) {
              const token = tx.tokensReceived[0];
              tokenSymbol = token.token_symbol || token.symbol || 'Unknown';
              const amount = token.token_amount || token.amount;
              if (amount) {
                tokenAmount = ` (${Math.abs(Number(amount)).toLocaleString()})`;
              }
            }

            const tooltipContent = `<strong>${formatNumber(tx.volumeUsd)}</strong><br><strong style="color: #34CF82;">${tokenSymbol}</strong>${tokenAmount}<br><small>${new Date(tx.blockTimestamp).toLocaleDateString()}</small>`;

            tooltip
              .style('display', 'block')
              .html(tooltipContent)
              .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
              .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);
          }
        })
        .on('mouseleave', function() {
          tooltip.style('display', 'none');
        })
        .on('mousemove', function(event) {
          if (tooltip.style('display') === 'block') {
            tooltip
              .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
              .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);
          }
        });

      // Create nodes
      const node = container.append('g')
        .selectAll('g')
        .data(nodes)
        .enter().append('g')
        .attr('class', 'bubble')
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));

      // Add circles - smooth fade-in animation
      node.append('circle')
        .attr('r', d => calculateRadius(d, sizeMetric, scaleFactor))
        .attr('fill', d => getNodeFillColor(d))
        .attr('stroke', d => getNodeStrokeColor(d, customHighlights, highlightShared, selectedNodeId))
        .attr('stroke-width', d => {
          if (customHighlights.has(d.id)) return SIZES.STROKE_WIDTH.HIGHLIGHTED;
          if (selectedNodeId && d.id === selectedNodeId) return SIZES.STROKE_WIDTH.HIGHLIGHTED;
          const radius = calculateRadius(d, sizeMetric, scaleFactor);
          return Math.max(1, radius * SIZES.STROKE_WIDTH.COUNTERPARTY_BASE);
        })
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .ease(d3.easeQuadOut)
        .attr('opacity', 1);

      // Add text labels - smooth fade-in animation
      node.append('text')
        .text(d => getNodeDisplayText(d, labelMode, customLabels, sizeMetric, scaleFactor))
        .attr('dy', 4)
        .attr('text-anchor', 'middle')
        .attr('fill', COLORS.WHITE)
        .style('font-weight', d => customLabels.has(d.id) ? '900' : 'normal')
        .style('font-size', d => `${calculateFontSize(d, sizeMetric, scaleFactor)}px`)
        .style('pointer-events', 'none')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .ease(d3.easeQuadOut)
        .attr('opacity', 1);

      // Add lock symbols for manually positioned nodes
      node.filter(d => lockedNodes.has(d.id))
        .append('text')
        .attr('class', 'lock-symbol')
        .text('🔒') // Simple lock character that can be styled
        .attr('x', d => -calculateRadius(d, sizeMetric, scaleFactor) * 0.7)
        .attr('y', d => -calculateRadius(d, sizeMetric, scaleFactor) * 0.7)
        .attr('fill', COLORS.WHITE)
        .style('font-size', ANIMATION.LOCK_SYMBOL_SIZE)
        .style('cursor', 'pointer')
        .style('pointer-events', 'all')
        .style('color', COLORS.WHITE)
        .style('-webkit-text-stroke', '1px white')
        .style('text-stroke', '1px white')
        .style('filter', 'grayscale(100%) brightness(0) invert(1)')
        .on('click', function(event, d) {
          event.stopPropagation();
          onToggleNodeLock(d.id, false);
          d.fx = null;
          d.fy = null;
          d3.select(this).remove();
        });

      // Add node interactions
      node
        .on('mouseenter', function(event, d) {
          // Don't show tooltip if node is being dragged
          if (d.isDragging) return;
          
          const tooltipContent = generateNodeTooltip(d, customLabels, formatNumber);
          tooltip
            .style('display', 'block')
            .html(tooltipContent)
            .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
            .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);
        })
        .on('mouseleave', function() {
          tooltip.style('display', 'none');
        })
        .on('mousemove', function(event, d) {
          // Don't update tooltip position if node is being dragged
          if (d.isDragging) {
            tooltip.style('display', 'none');
            return;
          }
          
          if (tooltip.style('display') === 'block') {
            tooltip
              .style('left', `${event.pageX + UI.TOOLTIP_OFFSET}px`)
              .style('top', `${event.pageY - UI.TOOLTIP_OFFSET}px`);
          }
        })
        .on('click', (event, d) => {
          if (!d.isDragging) {
            window.open(`https://app.nansen.ai/profiler?address=${d.address}&chain=${d.chain || 'ethereum'}&tab=overview`, '_blank');
          }
        })
        .on('contextmenu', function(event, d) {
          event.preventDefault();
          event.stopPropagation();
          
          setContextMenu({
            visible: true,
            x: event.pageX,
            y: event.pageY,
            node: d
          });
        });

      // Add click handler to SVG to close context menu
      svg.on('click', () => {
        closeContextMenu();
      });

      // Simulation tick function
      function ticked() {
        link.attr('d', function(d) {
          const sourceNode = addressMap.get(d.source.id || d.source);
          const targetNode = addressMap.get(d.target.id || d.target);
          
          if (!sourceNode || !targetNode) return '';
          
          if (sourceNode.isMain && targetNode.isMain) {
            // Main-to-main links with curved arrows
            const dx = targetNode.x - sourceNode.x;
            const dy = targetNode.y - sourceNode.y;
            const dr = Math.sqrt(dx * dx + dy * dy);
            
            const sourceRadius = calculateRadius(sourceNode, sizeMetric, scaleFactor);
            const targetRadius = calculateRadius(targetNode, sizeMetric, scaleFactor);
            
            const startX = sourceNode.x + (sourceRadius * dx / dr);
            const startY = sourceNode.y + (sourceRadius * dy / dr);
            const endX = targetNode.x - (targetRadius * dx / dr);
            const endY = targetNode.y - (targetRadius * dy / dr);
            
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const curvature = 0.3;
            const controlX = midX + (dy * curvature);
            const controlY = midY - (dx * curvature);
            
            const t = 0.95;
            const qt = 1 - t;
            const arrowEndX = qt * qt * startX + 2 * qt * t * controlX + t * t * endX;
            const arrowEndY = qt * qt * startY + 2 * qt * t * controlY + t * t * endY;
            
            return `M${startX},${startY} Q${controlX},${controlY} ${arrowEndX},${arrowEndY}`;
          } else {
            // Handle transaction links and regular aggregated links
            if (d.isTransactionLink && d.totalTransactions > 1) {
              const dx = targetNode.x - sourceNode.x;
              const dy = targetNode.y - sourceNode.y;
              const dr = Math.sqrt(dx * dx + dy * dy);
              
              const sourceRadius = calculateRadius(sourceNode, sizeMetric, scaleFactor);
              const targetRadius = calculateRadius(targetNode, sizeMetric, scaleFactor);
              
              const startX = sourceNode.x + (sourceRadius * dx / dr);
              const startY = sourceNode.y + (sourceRadius * dy / dr);
              const endX = targetNode.x - (targetRadius * dx / dr);
              const endY = targetNode.y - (targetRadius * dy / dr);
              
              // Create curves for multiple transactions
              const transactionIndex = d.transactionIndex || 0;
              const totalTransactions = d.totalTransactions;
              const spreadRange = 1.0;
              const spreadStep = spreadRange / Math.max(1, totalTransactions - 1);
              const spreadOffset = (transactionIndex * spreadStep) - (spreadRange / 2);
              
              const perpX = -dy / dr;
              const perpY = dx / dr;
              const curveDistance = 25 + Math.abs(spreadOffset) * 40;
              
              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;
              const controlX = midX + perpX * curveDistance * Math.sign(spreadOffset || 1);
              const controlY = midY + perpY * curveDistance * Math.sign(spreadOffset || 1);
              
              return `M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`;
            } else {
              // Regular straight line
              return `M${sourceNode.x},${sourceNode.y} L${targetNode.x},${targetNode.y}`;
            }
          }
        });

        node.attr('transform', d => `translate(${d.x},${d.y})`);
      }

      // Drag functions
      function dragstarted(event, d) {
        tooltip.style('display', 'none');
        closeContextMenu();
        
        // Gentle simulation activation for drag responsiveness - but only if simulation is stopped
        if (!event.active) simulation.alphaTarget(0.05).restart();
        d.fx = d.x;
        d.fy = d.y;
        
        // Track that dragging started
        d.isDragging = false; // Will be set to true if actually moved
        d.dragStartX = event.x;
        d.dragStartY = event.y;
        
        // If dragging a main node, store initial relative angles of connected counterparties
        if (d.isMain) {
          d.counterpartyAngles = new Map();
          nodes.forEach(node => {
            if (!node.isMain && !lockedNodes.has(node.id) && node.connectedTokens && node.connectedTokens.has(d.id)) {
              const dx = node.x - d.x;
              const dy = node.y - d.y;
              const angle = Math.atan2(dy, dx);
              const distance = Math.sqrt(dx * dx + dy * dy);
              d.counterpartyAngles.set(node.id, { angle, idealDistance: distance });
            }
          });
        }
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
        
        // Set isDragging immediately when dragging starts
        d.isDragging = true;
        
        // Hide tooltip during drag
        tooltip.style('display', 'none');
        
        // If dragging a main node, apply gentle forces to maintain relative positions
        if (d.isMain && d.counterpartyAngles) {
          nodes.forEach(node => {
            if (!node.isMain && !lockedNodes.has(node.id) && d.counterpartyAngles.has(node.id)) {
              const stored = d.counterpartyAngles.get(node.id);
              const currentDx = node.x - d.fx;
              const currentDy = node.y - d.fy;
              const currentDistance = Math.sqrt(currentDx * currentDx + currentDy * currentDy);
              
              // Calculate ideal position based on stored angle and distance
              const idealX = d.fx + stored.idealDistance * Math.cos(stored.angle);
              const idealY = d.fy + stored.idealDistance * Math.sin(stored.angle);
              
              // Apply gentle force towards ideal position (but not too strong to allow natural movement)
              const forceStrength = 0.15; // Gentle force to maintain position
              const pullX = (idealX - node.x) * forceStrength;
              const pullY = (idealY - node.y) * forceStrength;
              
              node.vx += pullX;
              node.vy += pullY;
              
              // Also prevent excessive stretching
              const maxDistance = stored.idealDistance * 1.3; // Allow 30% stretch
              if (currentDistance > maxDistance) {
                const pullStrength = 0.2;
                const excessPullFactor = (currentDistance - maxDistance) / currentDistance * pullStrength;
                node.vx -= currentDx * excessPullFactor;
                node.vy -= currentDy * excessPullFactor;
              }
            }
          });
        }
      }

      function dragended(event, d) {
        // Properly stop simulation when drag ends
        if (!event.active) simulation.alphaTarget(0);
        // Make both main nodes and counterparty nodes stick where they're dropped
        d.fx = d.x;
        d.fy = d.y;

        // Mark nodes as locked when manually positioned (only if actually dragged)
        if (d.isDragging) {
          onToggleNodeLock(d.id, true);
        }
        
        // Reset dragging flag after a short delay to allow click event to check it
        setTimeout(() => {
          d.isDragging = false;
        }, 100);
      }

      // Start simulation
      simulation
        .nodes(nodes)
        .on('tick', ticked);

      simulation.force('link').links(finalLinks);

      // Apply zoom transform
      svg.call(zoom).call(zoom.transform, oldTransform);

      // Very gentle simulation restart for smooth appearance
      simulation.alpha(0.05).restart(); // Very gentle to prevent jerky movements

    } catch (error) {
      console.error('Error creating visualization:', error);
    }
  }, [data, sizeMetric, scaleFactor, labelMode, customLabels, customHighlights, highlightShared, lockedNodes, deletedNodes, getProcessedData, selectedNodeId]);

  // Effect to trigger visualization updates
  useEffect(() => {
    createVisualization();
  }, [createVisualization]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      createVisualization();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [createVisualization]);

  // Debug: Log render state
  console.log('🔲 D3Visualization rendering with isFullscreen:', isFullscreen);

  return (
    <div
      ref={containerRef}
      style={{
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? '70px' : 'auto',
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: isFullscreen ? 'calc(100vh - 70px)' : '100vh',
        zIndex: isFullscreen ? 999 : 'auto',
        backgroundColor: COLORS.BACKGROUND
      }}
    >
      <svg
        ref={svgRef}
        style={{
          width: '100%',
          height: '100%',
          background: COLORS.BACKGROUND
        }}
      />

      {/* Fullscreen Button */}
      <button
        onClick={toggleFullscreen}
        style={{
          position: 'fixed',
          top: isFullscreen ? '80px' : '80px',
          right: '15px',
          padding: '8px 12px',
          background: COLORS.UI_BACKGROUND,
          border: '1px solid #555',
          borderRadius: '4px',
          color: COLORS.WHITE,
          cursor: 'pointer',
          fontSize: '12px',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'}
      >
        <span>{isFullscreen ? '⊡' : '⛶'}</span>
        <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
      </button>

      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        node={contextMenu.node}
        onClose={closeContextMenu}
        onCopyAddress={handleCopyAddress}
        onSetCustomLabel={onSetCustomLabel}
        onSetCustomHighlight={onSetCustomHighlight}
        onAddToken={onAddToken}
        onDeleteNode={onDeleteNode}
      />
    </div>
  );
};

export default D3Visualization; 