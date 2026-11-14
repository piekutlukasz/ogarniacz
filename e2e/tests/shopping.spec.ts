import { expect, test } from '../src/fixtures';
import { uniqueTitle } from '../src/data/titles';
import { App } from '../src/pages/App';

/** Znacznik tego testu w nazwach produktów, np. „iphone lx3k9a”. Patrz `ShoppingPage.showOnly`. */
function testMarker(): string {
  return uniqueTitle('').trim();
}

test('dziecko widzi produkt od rodzica i odhacza go, a rodzic widzi go w koszyku', async ({ parent, child }) => {
  const marker = testMarker();
  const milk = `Mleko ${marker}`;
  await parent.shopping.showOnly(marker);
  await child.shopping.showOnly(marker);

  await parent.open();
  await parent.shopping.open();
  await parent.shopping.add(milk, '2 l');

  await child.open();
  await expect(child.today.shoppingSection).toContainText(milk);
  await child.today.shoppingSection.getByRole('button', { name: /Otwórz listę/ }).click();
  await expect(child.shopping.navButton).toHaveAttribute('aria-current', 'page');
  await expect(child.shopping.toBuy(milk).root).toContainText('2 l');
  await child.shopping.toBuy(milk).toggle();
  await expect(child.shopping.inCart(milk).checkbox).toBeChecked();

  // Druga osoba dostaje zmianę przy odświeżeniu listy, np. po powrocie do aplikacji.
  await parent.page.reload();
  await parent.shopping.open();
  await expect(parent.shopping.inCart(milk).checkbox).toBeChecked();
});

test('wyczyszczony zakup wraca jako podpowiedź z ostatnią ilością', async ({ parent }) => {
  const marker = testMarker();
  const bread = `Chleb ${marker}`;
  const typo = `Chelb ${marker}`;
  await parent.shopping.showOnly(marker);
  await parent.open();
  await parent.shopping.open();

  const row = await parent.shopping.add(bread, '1');
  await row.changeQuantity('2');
  await expect(row.root).toContainText('2');
  await (await parent.shopping.add(typo)).remove();
  await expect(parent.shopping.toBuy(typo).root).toHaveCount(0);

  await row.toggle();
  await expect(parent.shopping.inCart(bread).checkbox).toBeChecked();
  await parent.shopping.clearButton.click();
  await expect(parent.shopping.cartSection).toHaveCount(0);
  await expect(parent.shopping.toBuy(bread).root).toHaveCount(0);

  // Podpowiedzi to tylko kupione produkty: literówka usunięta bez kupienia się nie pojawia.
  await parent.shopping.nameInput.fill(marker);
  await expect(parent.shopping.suggestion(bread)).toBeVisible();
  await expect(parent.shopping.suggestion(typo)).toHaveCount(0);

  await parent.shopping.suggestion(bread).click();
  await expect(parent.shopping.toBuy(bread).root).toContainText('2');
  await expect(parent.shopping.suggestion(bread)).toHaveCount(0);
});

test('zmiany bez sieci po zamknięciu aplikacji trafiają na drugi telefon bez duplikatów', async ({ parent, child }) => {
  const marker = testMarker();
  const butter = `Masło ${marker}`;
  const eggs = `Jajka ${marker}`;
  const context = parent.page.context();
  await parent.shopping.showOnly(marker);
  await parent.open();
  await parent.shopping.open();
  await parent.shopping.add(butter);

  // Sklep bez zasięgu: dodanie i odhaczenie widać od razu, a na serwer czekają w kolejce.
  await context.setOffline(true);
  await parent.shopping.add(eggs, '10');
  await parent.shopping.toBuy(butter).toggle();
  await expect(parent.shopping.inCart(butter).checkbox).toBeChecked();
  // Licznik rośnie po zapisie kolejki na telefonie, więc od tej chwili zmiany przetrwają zamknięcie aplikacji.
  await expect(parent.shopping.syncNote).toContainText('Niewysłane zmiany: 2');

  // Aplikacja zamknięta bez sieci. Po powrocie zasięgu otwiera się na nowo i sama wysyła kolejkę.
  await parent.page.close();
  await context.setOffline(false);
  const reopened = new App(await context.newPage());
  await reopened.shopping.showOnly(marker);
  await reopened.open();
  await reopened.shopping.open();
  await expect(reopened.shopping.inCart(butter).checkbox).toBeChecked();
  await expect(reopened.shopping.syncNote).toHaveCount(0);

  await child.shopping.showOnly(marker);
  await child.open();
  await child.shopping.open();
  await expect(child.shopping.toBuy(eggs).root).toHaveCount(1);
  await expect(child.shopping.toBuy(eggs).root).toContainText('10');
  await expect(child.shopping.inCart(butter).checkbox).toBeChecked();
});

test('dodanie, którego odpowiedź zginęła, wysłane ponownie nie robi duplikatu', async ({ parent, child }) => {
  const marker = testMarker();
  const sugar = `Cukier ${marker}`;
  const salt = `Sól ${marker}`;
  await parent.shopping.showOnly(marker);
  await parent.open();
  await parent.shopping.open();

  // Serwer zapisuje produkt, ale odpowiedź nie dociera do telefonu, jak przy zerwanym zasięgu.
  let lost = false;
  await parent.page.route('**/api/shopping', async (route) => {
    if (route.request().method() !== 'POST' || lost) return route.fallback();
    lost = true;
    await route.fetch();
    await route.abort('internetdisconnected');
  });
  await parent.shopping.add(sugar);
  await expect(parent.shopping.syncNote).toContainText('Niewysłane zmiany: 1');

  // Kolejna zmiana wysyła najpierw zaległe dodanie, tym razem z odpowiedzią.
  await parent.shopping.add(salt);
  await expect(parent.shopping.syncNote).toHaveCount(0);
  await expect(parent.shopping.toBuy(sugar).root).toHaveCount(1);

  await child.shopping.showOnly(marker);
  await child.open();
  await child.shopping.open();
  await expect(child.shopping.toBuy(salt).root).toBeVisible();
  await expect(child.shopping.toBuy(sugar).root).toHaveCount(1);
});
