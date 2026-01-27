import React from 'react';
import { COLORS } from '../../utils/constants.js';

const SAMPLE_TOKEN_ADDRESS = '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv';

const WelcomeScreen = ({ onLoadSample }) => {
  const handleSampleClick = () => {
    if (onLoadSample) {
      onLoadSample(SAMPLE_TOKEN_ADDRESS);
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: COLORS.BACKGROUND,
      color: COLORS.WHITE
    }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
        <h2 style={{ color: COLORS.ACCENT, marginBottom: '20px', fontSize: '24px' }}>
          Welcome to Token Bubble Maps
        </h2>
        <p style={{ marginBottom: '25px', lineHeight: '1.6', fontSize: '15px' }}>
          Add a token address in the input above to start exploring the top 100 holders and their distribution.
        </p>
        <div style={{
          background: COLORS.UI_BACKGROUND,
          padding: '20px',
          borderRadius: '8px',
          fontSize: '14px',
          border: `1px solid ${COLORS.ACCENT}30`
        }}>
          <strong style={{ fontSize: '15px' }}>Try this sample token:</strong><br/>
          <button
            onClick={handleSampleClick}
            style={{
              background: COLORS.BACKGROUND,
              padding: '10px 15px',
              borderRadius: '4px',
              marginTop: '12px',
              color: COLORS.ACCENT,
              border: `1px solid ${COLORS.ACCENT}`,
              cursor: 'pointer',
              fontSize: '13px',
              fontFamily: 'monospace',
              transition: 'all 0.2s',
              width: '100%',
              maxWidth: '450px'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = COLORS.ACCENT;
              e.target.style.color = COLORS.BACKGROUND;
            }}
            onMouseLeave={(e) => {
              e.target.style.background = COLORS.BACKGROUND;
              e.target.style.color = COLORS.ACCENT;
            }}
            title="Click to load this sample token"
          >
            {SAMPLE_TOKEN_ADDRESS}
          </button>
          <p style={{
            fontSize: '12px',
            marginTop: '12px',
            opacity: 0.7,
            lineHeight: '1.4'
          }}>
            Click the address above to automatically load it and visualize its top holders
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
