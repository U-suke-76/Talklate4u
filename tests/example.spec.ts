import { test, expect } from './fixtures';

test('App should launch', async ({ window }) => {
  const title = await window.title();
  console.log(`App title: ${title}`);
  expect(title).toBeDefined();
});
