import type { Locator } from '@playwright/test';

/** Fragment ekranu zakotwiczony w jednym elemencie. Wszystkie lokatory szuka wewnątrz `root`. */
export abstract class Component {
  constructor(readonly root: Locator) {}

  protected button(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }
}
