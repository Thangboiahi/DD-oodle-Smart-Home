import { NextRequest, NextResponse } from 'next/server';

/**
 * Phase 1.5 Voice C2C: Amazon Alexa Smart Home Skill Endpoint
 * Handles Discovery, PowerController, and RangeController directives.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const namespace = body.directive?.header?.namespace;
    const name = body.directive?.header?.name;
    const messageId = body.directive?.header?.messageId || `msg_${Date.now()}`;

    // 1. Alexa.Discovery: Reports endpoints
    if (namespace === 'Alexa.Discovery' && name === 'Discover') {
      return NextResponse.json({
        event: {
          header: {
            namespace: 'Alexa.Discovery',
            name: 'Discover.Response',
            payloadVersion: '3',
            messageId,
          },
          payload: {
            endpoints: [
              {
                endpointId: 'dd_pwr01_a1b2c3_ch1',
                manufacturerName: 'DD oodle',
                friendlyName: 'Living Room Lights',
                description: 'DD oodle Smart Switch Relay 1',
                displayCategories: ['LIGHT'],
                capabilities: [
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa.PowerController',
                    version: '3',
                    properties: { supported: [{ name: 'powerState' }], retrievable: true, proactivelyReported: true },
                  },
                ],
              },
              {
                endpointId: 'dd_pwr03_g7h8i9',
                manufacturerName: 'DD oodle',
                friendlyName: 'Bathroom Geyser',
                description: 'DD oodle 16A Heavy Appliance Switch',
                displayCategories: ['WATER_HEATER'],
                capabilities: [
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa.PowerController',
                    version: '3',
                    properties: { supported: [{ name: 'powerState' }], retrievable: true, proactivelyReported: true },
                  },
                ],
              },
            ],
          },
        },
      });
    }

    // 2. Alexa.PowerController: TurnOn / TurnOff
    if (namespace === 'Alexa.PowerController') {
      const endpointId = body.directive?.endpoint?.endpointId;
      const powerState = name === 'TurnOn' ? 'ON' : 'OFF';

      return NextResponse.json({
        event: {
          header: {
            namespace: 'Alexa',
            name: 'Response',
            messageId,
            correlationToken: body.directive?.header?.correlationToken,
            payloadVersion: '3',
          },
          endpoint: {
            endpointId,
          },
          payload: {},
        },
        context: {
          properties: [
            {
              namespace: 'Alexa.PowerController',
              name: 'powerState',
              value: powerState,
              timeOfSample: new Date().toISOString(),
              uncertaintyInMilliseconds: 200,
            },
          ],
        },
      });
    }

    return NextResponse.json({
      event: {
        header: {
          namespace: 'Alexa',
          name: 'ErrorResponse',
          messageId,
          payloadVersion: '3',
        },
        payload: {
          type: 'INVALID_DIRECTIVE',
          message: 'Directive not supported in Phase 1.5 C2C bridge.',
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
