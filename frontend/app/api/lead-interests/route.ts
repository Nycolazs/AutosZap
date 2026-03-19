import { NextRequest, NextResponse } from 'next/server';
import {
  getBackendUnavailableMessage,
  getBackendUrl,
  readBackendJson,
} from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const response = await fetch(`${getBackendUrl()}/api/platform/lead-interests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await readBackendJson(response);

    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        message: getBackendUnavailableMessage(),
      },
      { status: 503 },
    );
  }
}
