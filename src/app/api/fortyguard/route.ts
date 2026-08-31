import { NextResponse } from 'next/server';

const BASE_URL = 'https://api.fortyguard.com/v1';
const API_KEY = process.env.NEXT_PUBLIC_FORTYGUARD_API_KEY || 'b337c6004de0015c2e6453c291983918';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Step 1: Submit to FortyGuard
    const postRes = await fetch(`${BASE_URL}/env_params`, {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const postData = await postRes.json();
    if (!postData?.data?.activity_id) {
      return NextResponse.json({ error: 'Failed to submit analysis', details: postData }, { status: 400 });
    }

    const activityId = postData.data.activity_id;

    // Step 2: Poll for completion (max 15 attempts, 1s interval)
    let resultData = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await fetch(`${BASE_URL}/status/${activityId}`, {
        headers: {
          'api-key': API_KEY,
          'Accept': 'application/json',
        },
      });
      const statusJson = await statusRes.json();
      const status = statusJson?.data?.status;

      if (status === 'Completed') {
        resultData = statusJson.data.result;
        break;
      }
      if (status === 'Error') {
        return NextResponse.json({ error: 'FortyGuard processing error' }, { status: 500 });
      }
    }

    if (!resultData) {
      return NextResponse.json({ error: 'Timeout waiting for FortyGuard data' }, { status: 504 });
    }

    return NextResponse.json({ success: true, data: resultData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
