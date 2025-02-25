import { Page, expect } from '@playwright/test';
import { TEST_USERS } from './test-data';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function retry<T>(
  fn: () => Promise<T>,
  description: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${i + 1}/${maxRetries} failed for ${description}:`, error);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  throw lastError;
}

export async function loginUser(page: Page) {
  const user = TEST_USERS.student;
  
  await retry(async () => {
    // Navigate to login page
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for form elements
    const phoneInput = page.locator('[name="phoneNumber"]');
    const passwordInput = page.locator('[name="password"]');
    const submitButton = page.locator('button[type="submit"]');
    
    await Promise.all([
      phoneInput.waitFor({ state: 'visible' }),
      passwordInput.waitFor({ state: 'visible' }),
      submitButton.waitFor({ state: 'visible' })
    ]);

    // Fill in credentials
    await phoneInput.fill(user.phone);
    await passwordInput.fill(user.password);
    
    // Click submit
    await submitButton.click();

    // Wait for navigation
    await page.waitForURL('/search');
  }, 'login user');
}

export async function mockChapaPayment(page: Page, options = { status: 'success' }) {
  await retry(async () => {
    // Create purchase directly
    const response = await page.request.post(`/api/test/mock-purchase`, {
      data: {
        courseId: '945a7e40-4ed5-4959-b063-1726ae511d3c'
      }
    });

    if (!response.ok()) {
      throw new Error(`Failed to mock purchase: ${response.status()}`);
    }
  }, 'mock Chapa payment');
}

export async function setupTestData(page: Page) {
  return await retry(async () => {
    // First login as teacher to have permission to create courses
    await loginUser(page);

    // Now setup test data
    const response = await page.request.post(`/api/test/setup`, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok()) {
      const text = await response.text();
      console.error('[SETUP_TEST_DATA_ERROR] Response not OK:', {
        status: response.status(),
        statusText: response.statusText(),
        body: text
      });
      throw new Error(`Setup failed: ${response.status()} ${response.statusText()}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('[SETUP_TEST_DATA_ERROR] Invalid JSON:', text);
      throw new Error('Invalid JSON response from setup endpoint');
    }
  }, 'setup test data');
}

export async function cleanupTestData(page: Page) {
  await retry(async () => {
    // First login as teacher to have permission to cleanup
    await loginUser(page);

    // Now cleanup test data
    const response = await page.request.post(`/api/test/cleanup`, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(`Cleanup failed: ${response.status()} ${text}`);
    }
  }, 'cleanup test data');
}

// Helper for waiting for network stability
export async function waitForNetworkStability(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
    console.log('Network did not reach idle state, continuing anyway');
  });
} 