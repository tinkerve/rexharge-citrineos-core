// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import {
  createIdentifier,
  ErrorCode,
  IMessageConfirmation,
  MessageTypeId,
  OCPP1_6_CallAction,
  OcppError,
  OcppRequest,
  OcppResponse,
  OCPPVersion,
  RetryMessageError,
} from '@citrineos/base';
import { MemoryCache } from '@citrineos/util';
import { Logger } from 'tslog';
import { MessageRouterImpl, WebhookDispatcher } from '../../src';

// The suite imports the whole router module graph; under a loaded full run the first tests can take
// several seconds, so allow more than jest's 5 s default.
jest.setTimeout(30000);

// OCPP 1.6 allows one open call per direction. These tests drive the router the way a charger and the
// CSMS modules do and check what the charger receives (the network hook) and what is routed to the
// modules (the sender), using the real in-memory cache.
describe('MessageRouterImpl call tracking (REX-96)', () => {
  const TENANT_ID = 1;
  const STATION_ID = 'testing';
  const IDENTIFIER = createIdentifier(TENANT_ID, STATION_ID);
  const PROTOCOL = OCPPVersion.OCPP1_6;

  let sentToCharger: any[];
  let routedToModules: any[];
  let routeResult: IMessageConfirmation;
  let router: MessageRouterImpl;
  let handlerCalls: string[];
  let warnings: string[];

  beforeEach(() => {
    sentToCharger = [];
    routedToModules = [];
    routeResult = { success: true };
    const networkHook = async (_identifier: string, message: string) => {
      sentToCharger.push(JSON.parse(message));
    };
    const sender = {
      send: async (message: any) => {
        routedToModules.push(message);
        return routeResult;
      },
      shutdown: async () => {},
    };
    handlerCalls = [];
    warnings = [];
    const logger = new Logger<any>({ type: 'hidden' });
    logger.attachTransport((log: any) => {
      if (log._meta?.logLevelName === 'WARN') {
        warnings.push(
          Object.keys(log)
            .filter((k) => /^\d+$/.test(k))
            .map((k) => (typeof log[k] === 'string' ? log[k] : JSON.stringify(log[k])))
            .join(' '),
        );
      }
    });
    const handler = {
      initConnection: jest.fn(),
      shutdown: jest.fn(),
      subscribe: async () => {
        handlerCalls.push('subscribe');
        return true;
      },
      unsubscribe: async () => {
        handlerCalls.push('unsubscribe');
        return true;
      },
    };
    const dispatcher = {
      dispatchMessageSent: jest.fn(),
      dispatchMessageReceived: jest.fn(),
      register: jest.fn(async () => {}),
      deregister: jest.fn(async () => {}),
    } as unknown as WebhookDispatcher;
    const locationRepository = {
      setChargingStationIsOnlineAndOCPPVersion: jest.fn(async () => ({})),
      readChargingStationByStationId: jest.fn(async () => null),
    };
    router = new MessageRouterImpl(
      { maxCallLengthSeconds: 30 } as any,
      new MemoryCache(),
      sender as any,
      handler as any,
      dispatcher,
      networkHook,
      logger,
      undefined,
      locationRepository as any,
      {} as any,
    );
  });

  // _onCallResult / _onCallError process the cache lookups in a detached promise chain.
  const flush = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  };

  const remoteStop = (correlationId: string) =>
    router.sendCall(
      STATION_ID,
      TENANT_ID,
      PROTOCOL,
      OCPP1_6_CallAction.RemoteStopTransaction,
      { transactionId: 7 } as unknown as OcppRequest,
      correlationId,
    );

  const chargerSends = async (message: any[]) => {
    await router.onMessage(IDENTIFIER, JSON.stringify(message), new Date(), PROTOCOL);
    await flush();
  };

  const stopTransactionCall = (messageId: string) => [
    MessageTypeId.Call,
    messageId,
    'StopTransaction',
    {
      transactionId: 7,
      idTag: 'TAG1',
      meterStop: 6000,
      timestamp: new Date().toISOString(),
      reason: 'Remote',
    },
  ];

  const answerStopTransaction = (messageId: string) =>
    router.sendCallResult(
      messageId,
      STATION_ID,
      TENANT_ID,
      PROTOCOL,
      OCPP1_6_CallAction.StopTransaction,
      { idTagInfo: { status: 'Accepted' } } as unknown as OcppResponse,
    );

  const callErrorsToCharger = () => sentToCharger.filter((m) => m[0] === MessageTypeId.CallError);

  it('accepts a charger call while a CSMS call is outstanding', async () => {
    await remoteStop('csms-1');

    await chargerSends(stopTransactionCall('cs-1'));

    expect(callErrorsToCharger()).toEqual([]);
    expect(routedToModules.map((m) => m.context.correlationId)).toEqual(['cs-1']);

    const result = await answerStopTransaction('cs-1');
    expect(result.success).toBe(true);
    expect(sentToCharger[sentToCharger.length - 1]).toEqual([
      MessageTypeId.CallResult,
      'cs-1',
      { idTagInfo: { status: 'Accepted' } },
    ]);
  });

  it('keeps a pending charger call when the charger answers the CSMS call', async () => {
    await remoteStop('csms-1');
    await chargerSends(stopTransactionCall('cs-1'));

    await chargerSends([MessageTypeId.CallResult, 'csms-1', { status: 'Accepted' }]);

    const result = await answerStopTransaction('cs-1');
    expect(result.success).toBe(true);
    expect(sentToCharger[sentToCharger.length - 1][0]).toBe(MessageTypeId.CallResult);
    expect(sentToCharger[sentToCharger.length - 1][1]).toBe('cs-1');
  });

  it('holds a second CSMS call until the first is answered', async () => {
    await remoteStop('csms-1');

    await expect(remoteStop('csms-2')).rejects.toThrow(RetryMessageError);
    expect(sentToCharger.map((m) => m[1])).toEqual(['csms-1']);

    await chargerSends([MessageTypeId.CallResult, 'csms-1', { status: 'Accepted' }]);

    const retried = await remoteStop('csms-2');
    expect(retried.success).toBe(true);
    expect(sentToCharger.map((m) => m[1])).toEqual(['csms-1', 'csms-2']);
  });

  it('still holds a second CSMS call while a charger call is answered', async () => {
    await remoteStop('csms-1');
    await chargerSends(stopTransactionCall('cs-1'));
    await answerStopTransaction('cs-1');

    await expect(remoteStop('csms-2')).rejects.toThrow(RetryMessageError);
  });

  it('keeps the CSMS call outstanding when routing a charger call fails', async () => {
    await remoteStop('csms-1');
    routeResult = { success: false, payload: 'module down' };

    await chargerSends(stopTransactionCall('cs-1'));

    expect(callErrorsToCharger().map((m) => m[1])).toEqual(['cs-1']);
    await expect(remoteStop('csms-2')).rejects.toThrow(RetryMessageError);
  });

  it('accepts two charger calls in a row before either is answered', async () => {
    await chargerSends(stopTransactionCall('cs-1'));
    await chargerSends([MessageTypeId.Call, 'cs-2', 'Heartbeat', {}]);

    expect(callErrorsToCharger()).toEqual([]);
    expect(routedToModules.map((m) => m.context.correlationId)).toEqual(['cs-1', 'cs-2']);
    expect((await answerStopTransaction('cs-1')).success).toBe(true);
  });

  it('does not answer a charger call that is not pending', async () => {
    expect((await answerStopTransaction('unknown')).success).toBe(false);

    const error = await router.sendCallError(
      'unknown',
      STATION_ID,
      TENANT_ID,
      PROTOCOL,
      OCPP1_6_CallAction.StopTransaction,
      new OcppError('unknown', ErrorCode.InternalError, 'boom'),
    );
    expect(error.success).toBe(false);
    expect(sentToCharger).toEqual([]);
  });

  it('does not answer a pending charger call with a result for another action', async () => {
    await chargerSends(stopTransactionCall('cs-1'));

    const wrongAction = await router.sendCallResult(
      'cs-1',
      STATION_ID,
      TENANT_ID,
      PROTOCOL,
      OCPP1_6_CallAction.Heartbeat,
      { currentTime: new Date().toISOString() } as unknown as OcppResponse,
    );
    expect(wrongAction.success).toBe(false);
    expect((await answerStopTransaction('cs-1')).success).toBe(true);
  });

  it('answers a pending charger call only once', async () => {
    await chargerSends(stopTransactionCall('cs-1'));

    expect((await answerStopTransaction('cs-1')).success).toBe(true);
    expect((await answerStopTransaction('cs-1')).success).toBe(false);
  });

  it('deletes stale station queues before subscribing a new connection', async () => {
    const registered = await router.registerConnection(TENANT_ID, STATION_ID, PROTOCOL);

    expect(registered).toBe(true);
    expect(handlerCalls).toEqual(['unsubscribe', 'subscribe', 'subscribe']);
  });

  it('drops a duplicate of a CSMS call that is still outstanding', async () => {
    await remoteStop('csms-1');

    await expect(remoteStop('csms-1')).resolves.toBeDefined();

    expect(sentToCharger.map((m) => m[1])).toEqual(['csms-1']);
    expect(
      warnings.some(
        (w) => /Dropping duplicate/.test(w) && w.includes(IDENTIFIER) && w.includes('csms-1'),
      ),
    ).toBe(true);
  });

  it('drops a duplicate of a CSMS call that arrives just after the charger answered it', async () => {
    await remoteStop('csms-1');
    await chargerSends([MessageTypeId.CallResult, 'csms-1', { status: 'Accepted' }]);

    await remoteStop('csms-1');

    expect(sentToCharger.map((m) => m[1])).toEqual(['csms-1']);
  });

  it('still sends a different CSMS call after the first was answered', async () => {
    await remoteStop('csms-1');
    await chargerSends([MessageTypeId.CallResult, 'csms-1', { status: 'Accepted' }]);

    await remoteStop('csms-2');

    expect(sentToCharger.map((m) => m[1])).toEqual(['csms-1', 'csms-2']);
    expect(warnings.filter((w) => /Dropping duplicate/.test(w))).toEqual([]);
  });
});
