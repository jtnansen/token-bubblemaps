import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment variables (without VITE_ prefix for serverless functions)
  const apiKey = process.env.NANSEN_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // The request body is already in the correct format for the TGM holders API
    // No transformation needed - pass it through directly
    const requestBody = req.body;

    // Proxy the request to Nansen API
    const response = await fetch('https://api.nansen.ai/api/v1/tgm/holders', {
      method: 'POST',
      headers: {
        'apiKey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    // Handle response properly to avoid double-reading
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      return res.status(response.status).json(errorData);
    }

    // Get the response data only once and return it directly
    const data = await response.json();

    // Return the data directly - no transformation needed
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
