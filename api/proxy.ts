import agoraToken from 'agora-token';
const { AccessToken, RtcRole, Privileges } = agoraToken;

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
  const APP_ID = process.env.AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    console.error('[Agora Token] Error: Agora App ID or Certificate is not set in environment variables.');
    return new Response(JSON.stringify({ error: 'Agora credentials not configured on the server.' }), {
      status: 500,
      headers,
    });
  }

  const protocol = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  const fullUrl = new URL(request.url!, `${protocol}://${host}`);
  const { searchParams } = fullUrl;
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

  const role = RtcRole.PUBLISHER;
  const expireTime = 3600; // 1 hour
  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpireTime = currentTime + expireTime;

  try {
    const accessToken = new AccessToken(APP_ID, APP_CERTIFICATE, channelName, uid.toString());
    accessToken.addPrivilege(Privileges.kJoinChannel, privilegeExpireTime);

    if (role === RtcRole.PUBLISHER) {
        accessToken.addPrivilege(Privileges.kPublishAudioStream, privilegeExpireTime);
        accessToken.addPrivilege(Privileges.kPublishVideoStream, privilegeExpireTime);
        accessToken.addPrivilege(Privileges.kPublishDataStream, privilegeExpireTime);
    }

    const token = accessToken.build();

    return new Response(JSON.stringify({ rtcToken: token }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[Agora Token] Caught an error during token generation:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(JSON.stringify({
        error: 'Failed to generate Agora token internally.',
        details: errorMessage
    }), {
        status: 500,
        headers
    });
  }
}