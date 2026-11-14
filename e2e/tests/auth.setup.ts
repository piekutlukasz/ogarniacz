import { test as setup } from '@playwright/test';
import { ApiClient } from '../src/api/ApiClient';
import { TEST_USERS, storageStatePath } from '../src/data/users';
import { seedUsers } from '../src/setup/seedUsers';

// Konta trzeba założyć, zanim ktokolwiek się zaloguje.
setup.describe.configure({ mode: 'serial' });

setup('zakłada konta testowe', () => {
  seedUsers();
});

for (const user of TEST_USERS) {
  setup(`loguje ${user.login} i zapisuje sesję`, async ({ request }) => {
    await new ApiClient(request).logIn(user);
    await request.storageState({ path: storageStatePath(user) });
  });
}
