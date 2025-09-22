import { RtcTokenBuilder, RtcRole } from 'agora-token';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // CORS preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Set response headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // Get APP_ID and APP_CERTIFICATE from environment variables
  // The user will need to set these in their Vercel project settings.
  const APP_ID = process.env.AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    console.error('Agora App ID or Certificate is not set in environment variables.');
    return new Response(JSON.stringify({ error: 'Agora credentials not configured on the server.' }), {
      status: 500,
      headers,
    });
  }

  const { searchParams } = new URL(request.url);
  const channelName = searchParams.get('channelName');
  const uidStr = searchParams.get('uid');

  if (!channelName || !uidStr) {
    return new Response(JSON.stringify({ error: 'channelName and uid are required' }), {
      status: 400,
      headers,
    });
  }

  const uid = parseInt(uidStr, 10);
  if (isNaN(uid)) {
      return new Response(JSON.stringify({ error: 'uid must be an integer' }), {
          status: 400,
          headers,
      });
  }

  // Set role and expiration time
  const role = RtcRole.PUBLISHER;
  const expireTime = 3600; // 1 hour
  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpireTime = currentTime + expireTime;

  // Build the token
  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      role,
      privilegeExpireTime
    );

    // Return the token
    return new Response(JSON.stringify({ rtcToken: token }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate Agora token' }), {
      status: 500,
      headers,
    });
  }
}