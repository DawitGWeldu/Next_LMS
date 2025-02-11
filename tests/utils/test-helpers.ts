import { Page, expect } from '@playwright/test';
import { TEST_USERS } from './test-data';

export async function loginUser(page: Page, userType: keyof typeof TEST_USERS = 'student') {
  const user = TEST_USERS[userType];
  
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForLoadState('domcontentloaded');
  
  await page.fill('[name="phoneNumber"]', user.phone);
  await page.fill('[name="password"]', user.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('button[type="submit"]')
  ]);

  await page.waitForURL('/search');
  await expect(page).toHaveURL('/search');
}

export async function mockChapaPayment(page: Page, options = { status: 'success' }) {
  // Get the current URL parameters
  const url = new URL(page.url());
  const tx_ref = url.searchParams.get('tx_ref');

  // Mock successful payment by calling our webhook endpoint directly
  const response = await page.request.post(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`, {
    data: {
      event: 'charge.success',
      type: 'API',
      tx_ref: tx_ref,
      status: options.status
    }
  });

  expect(response.ok()).toBeTruthy();
}

export async function setupTestData(page: Page) {
  // Setup test database with required data
  // This could be done through direct DB access or API calls
  const response = await page.request.post(`${process.env.NEXT_PUBLIC_APP_URL}/api/test/setup`);
  expect(response.ok()).toBeTruthy();
}

export async function cleanupTestData(page: Page) {
  // Cleanup test data after tests
  const response = await page.request.post(`${process.env.NEXT_PUBLIC_APP_URL}/api/test/cleanup`);
  expect(response.ok()).toBeTruthy();
} 