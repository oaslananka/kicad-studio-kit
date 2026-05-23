import { TelemetryService } from '../../src/utils/telemetry';
import { __setConfiguration } from './vscodeMock';

describe('TelemetryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({});
  });

  it('does not emit events when telemetry is disabled by default', () => {
    const sender = { trackCommand: jest.fn() };
    const telemetry = new TelemetryService(sender);

    telemetry.trackCommand('kicadstudio.runDRC', 25);

    expect(sender.trackCommand).not.toHaveBeenCalled();
  });

  it('emits command timing only when the opt-in setting is enabled', () => {
    __setConfiguration({
      'kicadstudio.telemetry.enabled': true
    });
    const sender = { trackCommand: jest.fn() };
    const telemetry = new TelemetryService(sender);

    telemetry.trackCommand('kicadstudio.runDRC', 25);

    expect(sender.trackCommand).toHaveBeenCalledWith('kicadstudio.runDRC', {
      durationMs: 25
    });
  });

  it('emits tracked events only when telemetry is enabled', () => {
    __setConfiguration({
      'kicadstudio.telemetry.enabled': true
    });
    const sender = { trackCommand: jest.fn(), trackEvent: jest.fn() };
    const telemetry = new TelemetryService(sender);

    telemetry.trackEvent('kicadstudio.qualityGateOpened', {
      surface: 'sidebar'
    });

    expect(sender.trackEvent).toHaveBeenCalledWith(
      'kicadstudio.qualityGateOpened',
      {
        surface: 'sidebar'
      }
    );
  });

  it('does not send outbound telemetry without explicit opt-in even when an endpoint is configured', async () => {
    __setConfiguration({
      'kicadstudio.telemetry.endpoint': 'https://collector.example/events'
    });
    const sender = { send: jest.fn() };
    const telemetry = new TelemetryService(sender);

    telemetry.trackEvent('kicadstudio.activation', {
      surface: 'activation'
    });
    await telemetry.flush();

    expect(sender.send).not.toHaveBeenCalled();
    expect(telemetry.bufferedEvents()).toBe(0);
  });

  it('honors VS Code telemetry.telemetryLevel as an upper bound', async () => {
    __setConfiguration({
      'kicadstudio.telemetry.enabled': true,
      'kicadstudio.telemetry.endpoint': 'https://collector.example/events',
      'telemetry.telemetryLevel': 'error'
    });
    const sender = { send: jest.fn() };
    const telemetry = new TelemetryService(sender);

    telemetry.trackEvent('kicadstudio.activation', {
      surface: 'activation'
    });
    telemetry.trackError(new Error('activation failed'));
    await telemetry.flush();

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send.mock.calls[0]?.[0]).toMatchObject({
      kind: 'error',
      name: 'kicadstudio.error'
    });
  });

  it('emits only redacted telemetry payloads when enabled', async () => {
    __setConfiguration({
      'kicadstudio.telemetry.enabled': true,
      'kicadstudio.telemetry.endpoint': 'https://collector.example/events',
      'telemetry.telemetryLevel': 'all'
    });
    const sender = { send: jest.fn() };
    const telemetry = new TelemetryService(sender);
    const error = new Error(
      'Failed /home/alice/private/board.kicad_pcb token=secret123 https://private.example.test'
    );
    error.stack =
      'Error: Failed\n    at run (/home/alice/private/project/src/extension.ts:10:2)';

    telemetry.trackError(error, {
      project: '/home/alice/private/project',
      endpoint: 'https://private.example.test/api',
      apiKey: 'secret123'
    });
    await telemetry.flush();

    const payloadText = JSON.stringify(sender.send.mock.calls[0]?.[0]);
    expect(payloadText).toContain('[path]');
    expect(payloadText).toContain('[url]');
    expect(payloadText).toContain('[redacted]');
    expect(payloadText).not.toContain('/home/alice');
    expect(payloadText).not.toContain('private.example.test');
    expect(payloadText).not.toContain('secret123');
  });

  it('keeps a bounded offline buffer when the sender fails', async () => {
    __setConfiguration({
      'kicadstudio.telemetry.enabled': true,
      'kicadstudio.telemetry.endpoint': 'https://collector.example/events',
      'kicadstudio.telemetry.bufferLimit': 1,
      'telemetry.telemetryLevel': 'all'
    });
    const sender = {
      send: jest.fn(async () => Promise.reject(new Error('offline')))
    };
    const telemetry = new TelemetryService(sender);

    telemetry.trackEvent('kicadstudio.first');
    telemetry.trackEvent('kicadstudio.second');
    await telemetry.flush();

    expect(telemetry.bufferedEvents()).toBe(1);
    expect(JSON.stringify(telemetry.pendingEvents())).toContain(
      'kicadstudio.second'
    );
    expect(JSON.stringify(telemetry.pendingEvents())).not.toContain(
      'kicadstudio.first'
    );
  });

  it('keeps unsent events queued when the first send attempt fails', async () => {
    __setConfiguration({
      'kicadstudio.telemetry.enabled': true,
      'kicadstudio.telemetry.endpoint': 'https://collector.example/events',
      'kicadstudio.telemetry.bufferLimit': 5,
      'telemetry.telemetryLevel': 'all'
    });
    const sender = {
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(undefined)
    };
    const telemetry = new TelemetryService(sender);

    telemetry.trackEvent('kicadstudio.first');
    telemetry.trackEvent('kicadstudio.second');
    await telemetry.flush();

    expect(telemetry.bufferedEvents()).toBe(2);
    await telemetry.flush();
    expect(telemetry.bufferedEvents()).toBe(0);
    expect(sender.send.mock.calls.map((call) => call[0].name)).toEqual([
      'kicadstudio.first',
      'kicadstudio.first',
      'kicadstudio.second'
    ]);
  });
});
