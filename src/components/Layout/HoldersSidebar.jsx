import React from 'react';
import { COLORS } from '../../utils/constants.js';

const HoldersSidebar = ({ data, loading, loadingProgress }) => {
  // Get all holders from all datasets
  const allHolders = [];
  data.forEach(dataset => {
    if (dataset.holders) {
      dataset.holders.forEach(holder => {
        allHolders.push({
          ...holder,
          tokenAddress: dataset.tokenAddress
        });
      });
    }
  });

  return (
    <div style={{
      position: 'fixed',
      top: '70px',
      right: '0',
      bottom: '0',
      width: '320px',
      background: COLORS.BACKGROUND,
      borderLeft: `1px solid ${COLORS.UI_BACKGROUND}`,
      overflowY: 'auto',
      padding: '15px',
      zIndex: 100
    }}>
      <h3 style={{
        color: COLORS.ACCENT,
        fontSize: '16px',
        marginTop: 0,
        marginBottom: '15px',
        borderBottom: `1px solid ${COLORS.UI_BACKGROUND}`,
        paddingBottom: '10px'
      }}>
        Top Holders ({allHolders.length})
      </h3>

      {loading && (
        <div style={{
          color: COLORS.ACCENT,
          fontSize: '12px',
          padding: '10px',
          textAlign: 'center'
        }}>
          Loading holders...
        </div>
      )}

      {loadingProgress && loadingProgress.total > 0 && (
        <div style={{
          color: COLORS.ACCENT,
          fontSize: '11px',
          padding: '10px',
          background: COLORS.UI_BACKGROUND,
          borderRadius: '4px',
          marginBottom: '10px'
        }}>
          <div style={{ marginBottom: '5px' }}>
            Analyzing interactions: {loadingProgress.current}/{loadingProgress.total}
          </div>
          <div style={{
            width: '100%',
            height: '4px',
            background: COLORS.BACKGROUND,
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
              height: '100%',
              background: COLORS.ACCENT,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {allHolders.map((holder, index) => {
          const displayAddress = holder.address.slice(0, 8) + '...' + holder.address.slice(-6);
          const ownership = holder.ownership_percentage?.toFixed(2) || '0.00';
          const valueUsd = holder.value_usd ? `$${(holder.value_usd / 1000).toFixed(1)}K` : 'N/A';

          return (
            <div
              key={holder.address}
              style={{
                background: COLORS.UI_BACKGROUND,
                padding: '10px',
                borderRadius: '4px',
                fontSize: '11px',
                color: COLORS.WHITE,
                border: `1px solid ${COLORS.BACKGROUND}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                animation: `slideIn 0.3s ease-out ${index * 0.05}s both`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.ACCENT;
                e.currentTarget.style.background = `${COLORS.UI_BACKGROUND}dd`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.BACKGROUND;
                e.currentTarget.style.background = COLORS.UI_BACKGROUND;
              }}
              onClick={() => {
                navigator.clipboard.writeText(holder.address);
                console.log('📋 Copied:', holder.address);
              }}
              title="Click to copy address"
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '4px'
              }}>
                <span style={{ color: COLORS.ACCENT, fontWeight: '500' }}>
                  #{index + 1}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>
                  {ownership}%
                </span>
              </div>

              {holder.address_label && (
                <div style={{
                  fontSize: '10px',
                  marginBottom: '4px',
                  fontWeight: '500',
                  color: COLORS.WHITE
                }}>
                  {holder.address_label.slice(0, 35)}
                  {holder.address_label.length > 35 ? '...' : ''}
                </div>
              )}

              <div style={{
                fontFamily: 'monospace',
                fontSize: '10px',
                opacity: 0.8,
                marginBottom: '4px'
              }}>
                {displayAddress}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                opacity: 0.7
              }}>
                <span>Value: {valueUsd}</span>
                {holder.token_amount && (
                  <span>{(holder.token_amount / 1000000).toFixed(2)}M tokens</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default HoldersSidebar;
