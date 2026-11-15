import { type Browser, type BrowserContextOptions, type TestInfo, test as base } from '@playwright/test';
import { ApiClient } from '../api/ApiClient';
import { CHILD, PROJECT_CHILDREN, PARENT, type TestUser, storageStatePath } from '../data/users';
import { App } from '../pages/App';
import { LoginPage } from '../pages/LoginPage';
import { Actor } from './Actor';

type Fixtures = {
  /** Aplikacja na domyślnej, niezalogowanej karcie `page`. */
  app: App;
  loginPage: LoginPage;
  parent: Actor;
  child: Actor;
  /** Dziecko tylko tego projektu, do testów zmieniających ustawienia konta. */
  projectChild: Actor;
  /** Drugi telefon: niezalogowana karta w osobnym kontekście przeglądarki, z ekranem logowania. */
  otherDevice: LoginPage;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use) => {
    await use(new App(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  parent: async ({ browser }, use, testInfo) => {
    await useActor(browser, testInfo, PARENT, use);
  },
  child: async ({ browser }, use, testInfo) => {
    await useActor(browser, testInfo, CHILD, use);
  },
  projectChild: async ({ browser }, use, testInfo) => {
    await useActor(browser, testInfo, PROJECT_CHILDREN[testInfo.project.name]!, use);
  },
  otherDevice: async ({ browser }, use, testInfo) => {
    const context = await browser.newContext(projectContextOptions(testInfo));
    try {
      await use(new LoginPage(await context.newPage()));
    } finally {
      await context.close();
    }
  },
});

export { expect } from '@playwright/test';

/**
 * `browser.newContext()` nie bierze ustawień z `use` projektu, więc przenosimy te,
 * od których zależy wygląd: telefon z projektu (iPhone, Pixel) i adres aplikacji.
 */
function projectContextOptions(testInfo: TestInfo): BrowserContextOptions {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = testInfo.project.use;
  return { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId };
}

async function useActor(browser: Browser, testInfo: TestInfo, user: TestUser, use: (actor: Actor) => Promise<void>) {
  const context = await browser.newContext({
    ...projectContextOptions(testInfo),
    storageState: storageStatePath(user),
  });
  try {
    await use(new Actor(await context.newPage(), user, new ApiClient(context.request)));
  } finally {
    await context.close();
  }
}
