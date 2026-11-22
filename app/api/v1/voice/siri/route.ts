import { NextRequest, NextResponse } from 'next/server';

/**
 * Phase 1.5 Voice C2C: Apple Siri Shortcuts Webhook & Intent Endpoint
 * Supports triggering scenes and querying device status from iOS Shortcuts app.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const scene = searchParams.get('scene');
  const deviceId = searchParams.get('device_id');

  if (action === 'run_scene' && scene) {
    return NextResponse.json({
      status: 'SUCCESS',
      message: `Triggered Indian Recipe scene: ${scene}`,
      scene,
      ts: Math.floor(Date.now() / 1000),
    });
  }

  if (action === 'get_shortcuts') {
    return NextResponse.json({
      shortcuts: [
        {
          name: 'DD oodle Inverter Saver',
          phrase: 'Hey Siri, save my inverter battery',
          actionUrl: '/api/v1/voice/siri?action=run_scene&scene=inverter_saver',
        },
        {
          name: 'DD oodle Morning Geyser',
          phrase: 'Hey Siri, turn on morning geyser',
          actionUrl: '/api/v1/voice/siri?action=run_scene&scene=geyser_morning',
        },
        {
          name: 'DD oodle Porch Lights',
          phrase: 'Hey Siri, turn on porch lights',
          actionUrl: '/api/v1/voice/siri?action=run_scene&scene=porch_lights',
        },
      ],
    });
  }

  return NextResponse.json({
    status: 'ONLINE',
    bridge: 'DD oodle Siri Shortcuts C2C Bridge v1.5',
    deviceId: deviceId || 'all',
  });
}
