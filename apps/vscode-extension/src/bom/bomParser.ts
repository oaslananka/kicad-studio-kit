import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import type { BomEntry } from '../types';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';

interface RawBomRow {
  reference: string;
  value: string;
  footprint: string;
  mpn: string;
  manufacturer: string;
  lcsc: string;
  description: string;
  dnp: boolean;
  uuid?: string | undefined;
}

export class BomParser {
  constructor(private readonly parser: SExpressionParser) {}

  parse(textOrNode: string | SNode, groupIdentical?: boolean): BomEntry[] {
    const root =
      typeof textOrNode === 'string'
        ? this.parser.parse(textOrNode)
        : textOrNode;
    const shouldGroup =
      groupIdentical ??
      vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.bomGroupIdentical, true);

    const rows = this.extractSymbols(root)
      .map((symbol) => this.toEntry(symbol))
      .filter((entry): entry is RawBomRow => Boolean(entry?.reference));

    if (!shouldGroup) {
      return rows.map((row) => ({
        references: [row.reference],
        value: row.value,
        footprint: row.footprint,
        quantity: 1,
        mpn: row.mpn,
        manufacturer: row.manufacturer,
        lcsc: row.lcsc,
        description: row.description,
        dnp: row.dnp,
        uuid: row.uuid
      }));
    }

    const groups = new Map<string, BomEntry>();
    for (const row of rows) {
      const key = [
        row.value,
        row.footprint,
        row.mpn,
        row.manufacturer,
        row.description,
        row.lcsc,
        row.dnp ? 'dnp' : 'fit'
      ].join('|');

      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          references: [row.reference],
          value: row.value,
          footprint: row.footprint,
          quantity: 1,
          mpn: row.mpn,
          manufacturer: row.manufacturer,
          lcsc: row.lcsc,
          description: row.description,
          dnp: row.dnp,
          uuid: row.uuid
        });
      } else {
        existing.references.push(row.reference);
        existing.quantity += 1;
      }
    }

    return [...groups.values()].sort((left, right) =>
      left.references.join(',').localeCompare(right.references.join(','))
    );
  }

  private extractSymbols(root: SNode): SNode[] {
    return this.parser.findAllNodes(root, 'symbol').filter((node) => {
      const libId = this.parser.getAtomValue(node, 'lib_id') ?? '';
      return !libId.startsWith('power:');
    });
  }

  private toEntry(symbol: SNode): RawBomRow | null {
    const propertyMap = this.getPropertyMap(symbol);
    const reference =
      propertyMap.get('Reference') ??
      this.parser.getAtomValue(symbol, 'reference') ??
      '';
    if (!reference) {
      return null;
    }

    const dnp =
      ['yes', 'true', '1'].includes(
        (propertyMap.get('DNP') ?? '').toLowerCase()
      ) ||
      (this.parser.getAtomValue(symbol, 'in_bom') ?? 'yes') === 'no' ||
      (this.parser.getAtomValue(symbol, 'on_board') ?? 'yes') === 'no';

    return {
      reference,
      value:
        this.getProperty(propertyMap, 'Value') ??
        this.parser.getAtomValue(symbol, 'value') ??
        '',
      footprint:
        this.getProperty(propertyMap, 'Footprint') ??
        this.parser.getAtomValue(symbol, 'footprint') ??
        '',
      mpn: this.getProperty(propertyMap, 'MPN', 'Part Number') ?? '',
      manufacturer: this.getProperty(propertyMap, 'Manufacturer') ?? '',
      lcsc: this.getProperty(propertyMap, 'LCSC', 'LCSC Part', 'lcsc') ?? '',
      description: this.getProperty(propertyMap, 'Description') ?? '',
      dnp,
      uuid: this.parser.getAtomValue(symbol, 'uuid')
    };
  }

  private getPropertyMap(symbol: SNode): Map<string, string> {
    const result = new Map<string, string>();
    for (const property of symbol.children?.filter(
      (node) => this.getTag(node) === 'property'
    ) ?? []) {
      const name = property.children?.[1];
      const value = property.children?.[2];
      if (!name || !value) {
        continue;
      }
      const normalizedName = String(name.value ?? '');
      result.set(normalizedName, String(value.value ?? ''));
      result.set(normalizedName.toLowerCase(), String(value.value ?? ''));
    }
    return result;
  }

  private getProperty(
    propertyMap: Map<string, string>,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = propertyMap.get(key) ?? propertyMap.get(key.toLowerCase());
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private getTag(node: SNode): string | undefined {
    const head = node.children?.[0];
    return head && (head.type === 'atom' || head.type === 'string')
      ? String(head.value ?? '')
      : undefined;
  }
}
