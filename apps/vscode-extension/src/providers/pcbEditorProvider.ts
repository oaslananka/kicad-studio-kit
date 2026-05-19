import * as vscode from 'vscode';
import type { TuningProfile, ViewerLayerInfo, ViewerMetadata } from '../types';
import { BaseKiCanvasEditorProvider } from './baseKiCanvasEditorProvider';

export class PcbEditorProvider extends BaseKiCanvasEditorProvider {
  protected override readonly fileExtension = '.kicad_pcb';
  protected override readonly fileType = 'board' as const;
  protected override readonly viewerTitle = 'KiCad Studio PCB Viewer';

  protected override buildViewerMetadata(
    _uri: vscode.Uri,
    text: string
  ): ViewerMetadata | undefined {
    return {
      layers: this.extractLayers(text),
      tuningProfiles: this.extractTuningProfiles(text)
    };
  }

  private extractLayers(pcbContent: string): ViewerLayerInfo[] {
    const layers: ViewerLayerInfo[] = [];
    let insideLayers = false;

    for (const rawLine of pcbContent.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!insideLayers) {
        if (line.startsWith('(layers')) {
          insideLayers = true;
        }
        continue;
      }

      if (line === ')') {
        break;
      }

      const match = line.match(/\(\s*\d+\s+"([^"]+)"\s+([A-Za-z_.-]+)/);
      if (!match?.[1]) {
        continue;
      }

      layers.push({
        name: match[1],
        ...(match[2] ? { kind: match[2] } : {}),
        visible: true
      });
    }

    return layers;
  }

  private extractTuningProfiles(pcbContent: string): TuningProfile[] {
    const profiles = [
      ...pcbContent.matchAll(/\(\s*tuning_profile([\s\S]*?)\)\s*\)/g)
    ];
    return profiles.map((match, index) => {
      const block = match[1] ?? '';
      return {
        name: readToken(block, 'name') ?? `Profile ${index + 1}`,
        layer: readToken(block, 'layer'),
        impedance: readToken(block, 'impedance'),
        propagationSpeed:
          readToken(block, 'propagation_speed') ?? readToken(block, 'velocity'),
        raw: block.replace(/\s+/g, ' ').trim()
      };
    });
  }
}

function readToken(block: string, key: string): string | undefined {
  return block
    .match(new RegExp(`\\(\\s*${key}\\s+"?([^\\)"]+)"?\\s*\\)`))?.[1]
    ?.trim();
}
