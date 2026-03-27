import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InstanceRegistryEntry } from './types';

type RegistryDocument = {
  entries: InstanceRegistryEntry[];
};

export class RegistryStore {
  constructor(private readonly filePath: string) {}

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<RegistryDocument>;
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      return entries.filter(
        (entry): entry is InstanceRegistryEntry =>
          Boolean(entry?.instanceId && entry?.callbackUrl),
      );
    } catch {
      return [];
    }
  }

  async save(entries: InstanceRegistryEntry[]) {
    const document: RegistryDocument = { entries };
    await writeFile(
      this.filePath,
      `${JSON.stringify(document, null, 2)}\n`,
      'utf8',
    );
  }

  async ensureDirectory() {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
  }
}
