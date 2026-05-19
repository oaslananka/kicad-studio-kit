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
});
